import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit,requestIp } from "@/lib/rate-limit";

const providers = [];
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) providers.push(Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }));
if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) providers.push(GitHub({ clientId: process.env.GITHUB_ID, clientSecret: process.env.GITHUB_SECRET }));
const baseAdapter = PrismaAdapter(prisma)!;
// OAuth is used for identity only in this release. Do not persist bearer/refresh tokens
// until a repository integration has a reviewed encrypted-token storage design.
const identityOnlyAdapter: NonNullable<typeof baseAdapter> = { ...baseAdapter, async linkAccount(account) {
  await prisma.account.create({ data: { userId: account.userId, type: account.type, provider: account.provider, providerAccountId: account.providerAccountId } });
  return { userId: account.userId, type: account.type, provider: account.provider, providerAccountId: account.providerAccountId };
} };

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: identityOnlyAdapter, session: { strategy: "jwt", maxAge: 8*60*60 },
  pages: { signIn: "/login" }, providers: [...providers, Credentials({ credentials: { email: {}, password: {} }, async authorize(credentials,request) {
    const parsed = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(1).max(128) }).safeParse(credentials);
    if (!parsed.success) return null;
    const [emailAllowed,ipAllowed]=await Promise.all([consumeRateLimit(`login-email:${parsed.data.email}`,10,15*60*1000),consumeRateLimit(`login-ip:${requestIp(request)}`,30,15*60*1000)]);if(!emailAllowed||!ipAllowed)return null;
    const matches = await prisma.$queryRaw<Array<{id:string;name:string|null;email:string;image:string|null;passwordHash:string|null;emailVerified:Date|null;status:string;role:string}>>`
      SELECT "id","name","email","image","passwordHash","emailVerified","status","role" FROM "User"
      WHERE LOWER(BTRIM("email")) = ${parsed.data.email}
      LIMIT 1
    `;
    const user = matches[0];
    if (!user?.passwordHash || !user.emailVerified || user.status !== "ACTIVE" || !(await compare(parsed.data.password, user.passwordHash))) return null;
    return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role };
  } })],
  callbacks: { async signIn({ user }) { if (!user.id) return false; const account = await prisma.user.findUnique({ where: { id: user.id }, select: { status: true } }); return account?.status === "ACTIVE"; }, async jwt({ token, user }) { if(user?.id)token.sub=user.id;if(token.sub){const current=await prisma.user.findUnique({where:{id:token.sub},select:{role:true,status:true,sessionVersion:true,name:true,email:true,image:true}});if(!current||current.status!=="ACTIVE"||(typeof token.sessionVersion==="number"&&token.sessionVersion!==current.sessionVersion)){token.sub="";token.role="USER";token.sessionVersion=-1;}else{token.role=current.role;token.sessionVersion=current.sessionVersion;token.name=current.name;token.email=current.email;token.picture=current.image;}}return token; }, async session({ session, token }) { if (session.user) { session.user.id = token.sub||""; session.user.role = String(token.role ?? "USER"); } return session; } }
});
