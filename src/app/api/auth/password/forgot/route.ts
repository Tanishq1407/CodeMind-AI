import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, readJsonBounded, requestIp, sameOrigin } from "@/lib/rate-limit";
import { createRawToken, hashToken, validAppOrigin } from "@/lib/tokens";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const genericMessage = "If an eligible account exists, a reset link will be sent.";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  let body: unknown;
  try {
    body = await readJsonBounded(request, 1000);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = z.object({ email: emailSchema }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return NextResponse.json({ error: "Password recovery email is not configured." }, { status: 503 });
  }

  const email = parsed.data.email;
  try {
    const [ipAllowed, emailAllowed] = await Promise.all([
      consumeRateLimit(`reset-ip:${requestIp(request)}`, 10, 60 * 60 * 1000),
      consumeRateLimit(`reset-email:${email}`, 3, 60 * 60 * 1000),
    ]);
    if (!ipAllowed || !emailAllowed) return NextResponse.json({ ok: true, message: genericMessage });

    const users = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE LOWER(BTRIM("email")) = ${email}
      LIMIT 1
    `;
    const user = users[0];
    if (user) {
      const rawToken = createRawToken();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.create({
          data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt },
        });
      });
      const url = `${validAppOrigin(request)}/reset-password?token=${encodeURIComponent(rawToken)}`;
      await sendEmail(email, "Reset your CodeMind AI password", `Use this link within 30 minutes to set a new password:\n\n${url}\n\nIf you did not request this, ignore this email.`);
    }
    return NextResponse.json({ ok: true, message: genericMessage });
  } catch {
    return NextResponse.json({ error: "Password recovery is temporarily unavailable." }, { status: 503 });
  }
}
