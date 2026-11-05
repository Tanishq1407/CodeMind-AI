import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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
  adapter: identityOnlyAdapter, session: { strategy: "jwt" },
  pages: { signIn: "/login" }, providers: [...providers, Credentials({ credentials: { email: {}, password: {} }, async authorize(credentials) {
    const parsed = z.object({ email: z.email(), password: z.string().min(1).max(128) }).safeParse(credentials);
    if (!parsed.success) return null;
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (!user?.passwordHash || user.status !== "ACTIVE" || !(await compare(parsed.data.password, user.passwordHash))) return null;
    return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role };
  } })],
  callbacks: { async signIn({ user }) { if (!user.id) return false; const account = await prisma.user.findUnique({ where: { id: user.id }, select: { status: true } }); return account?.status === "ACTIVE"; }, async jwt({ token, user }) { if (user?.id) { token.sub = user.id; token.role = (user as typeof user & { role?: string }).role ?? "USER"; } return token; }, async session({ session, token }) { if (session.user) { session.user.id = token.sub!; session.user.role = String(token.role ?? "USER"); } return session; } }
});
