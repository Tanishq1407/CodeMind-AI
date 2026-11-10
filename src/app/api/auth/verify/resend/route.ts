import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, readJsonBounded, requestIp, sameOrigin } from "@/lib/rate-limit";
import { createRawToken, hashToken, validAppOrigin } from "@/lib/tokens";
import { sendEmail } from "@/lib/email";
import { registrationDatabaseLogMetadata } from "@/lib/registration-config";

export const runtime = "nodejs";

const genericMessage = "If an unverified account exists for this email, a verification link has been sent.";
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified.", code: "INVALID_ORIGIN" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await readJsonBounded(request, 1000);
  } catch {
    return NextResponse.json({ error: "Invalid request body.", code: "INVALID_REQUEST_BODY" }, { status: 400 });
  }

  const parsed = z.object({ email: emailSchema }).safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address.", code: "INVALID_EMAIL" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return NextResponse.json({ error: "Verification service is temporarily unavailable.", code: "VERIFICATION_UNAVAILABLE" }, { status: 503 });
  }

  const email = parsed.data.email;
  let stage = "rate_limit";
  try {
    const [ipAllowed, emailAllowed] = await Promise.all([
      consumeRateLimit(`verify-ip:${requestIp(request)}`, 10, 60 * 60 * 1000),
      consumeRateLimit(`verify-email:${email}`, 3, 60 * 60 * 1000),
    ]);
    if (!ipAllowed || !emailAllowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later.", code: "RATE_LIMITED" }, { status: 429 });
    }

    stage = "account_lookup";
    const matches = await prisma.$queryRaw<Array<{ id: string; emailVerified: Date | null }>>`
      SELECT "id", "emailVerified" FROM "User"
      WHERE LOWER(BTRIM("email")) = ${email}
      LIMIT 1
    `;
    const account = matches[0];
    if (!account || account.emailVerified !== null) {
      return NextResponse.json({ ok: true, message: genericMessage });
    }

    const rawToken = createRawToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const tokenStored = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ emailVerified: Date | null }>>`
        SELECT "emailVerified" FROM "User" WHERE "id" = ${account.id} FOR UPDATE
      `;
      if (!locked[0] || locked[0].emailVerified !== null) return false;

      await tx.emailVerificationToken.deleteMany({ where: { userId: account.id } });
      await tx.emailVerificationToken.create({
        data: { userId: account.id, tokenHash: hashToken(rawToken), expiresAt },
      });
      return true;
    });

    if (!tokenStored) return NextResponse.json({ ok: true, message: genericMessage });

    stage = "email_delivery";
    try {
      const verificationUrl = `${validAppOrigin(request)}/verify-email?token=${encodeURIComponent(rawToken)}`;
      await sendEmail(
        email,
        "Verify your CodeMind AI email",
        `Confirm your email within 30 minutes:\n\n${verificationUrl}\n\nIf you did not create this account, ignore this message.`,
      );
    } catch (error) {
      console.error("[auth/verify/resend] Email delivery failed", registrationDatabaseLogMetadata(error, stage));
      // Keep the response identical to the nonexistent/verified-account response.
    }

    return NextResponse.json({ ok: true, message: genericMessage });
  } catch (error) {
    console.error("[auth/verify/resend] Request failed", registrationDatabaseLogMetadata(error, stage));
    return NextResponse.json({ error: "Verification service is temporarily unavailable.", code: "VERIFICATION_UNAVAILABLE" }, { status: 503 });
  }
}
