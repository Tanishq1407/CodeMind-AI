import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, readJsonBounded, requestIp, sameOrigin } from "@/lib/rate-limit";
import { createRawToken, hashToken, validAppOrigin } from "@/lib/tokens";
import { sendEmail } from "@/lib/email";
import { missingRegistrationConfiguration, registrationDatabaseFailure } from "@/lib/registration-config";

export const runtime = "nodejs";

const password = z.string().min(12).refine(
  (value) => new TextEncoder().encode(value).length <= 72,
  "Password must be at most 72 UTF-8 bytes.",
);
const schema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  email: z.email().max(254),
  password,
});

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified.", code: "INVALID_ORIGIN" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await readJsonBounded(request, 2000);
  } catch {
    return NextResponse.json({ error: "Invalid request body.", code: "INVALID_REQUEST_BODY" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: "Check your username, email, and password (12+ characters).",
      code: "INVALID_REGISTRATION_DETAILS",
    }, { status: 400 });
  }

  const missing = missingRegistrationConfiguration({
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  });
  if (missing.length) {
    return NextResponse.json({
      error: `Registration is not configured. Set ${missing.join(", ")} in .env.local, then restart the app.`,
      code: "REGISTRATION_NOT_CONFIGURED",
    }, { status: 503 });
  }

  const { username, password: plainPassword } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  let passwordHash: string;
  try {
    passwordHash = await hash(plainPassword, 12);
  } catch {
    return NextResponse.json({ error: "Registration could not be completed. Please try again.", code: "PASSWORD_HASH_FAILED" }, { status: 500 });
  }

  const rawToken = createRawToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  let user: { id: string; email: string };
  try {
    const [ipAllowed, emailAllowed] = await Promise.all([
      consumeRateLimit(`register-ip:${requestIp(request)}`, 20, 60 * 60 * 1000),
      consumeRateLimit(`register-email:${email}`, 5, 60 * 60 * 1000),
    ]);
    if (!ipAllowed || !emailAllowed) {
      return NextResponse.json({ error: "Too many attempts. Try again later.", code: "RATE_LIMITED" }, { status: 429 });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({
        error: "Unable to create this account. Check the details or sign in.",
        code: "ACCOUNT_ALREADY_EXISTS",
      }, { status: 409 });
    }

    const tokenHash = hashToken(rawToken);
    user = await prisma.user.create({
      data: {
        name: username,
        username,
        email,
        passwordHash,
        emailVerificationTokens: { create: { tokenHash, expiresAt } },
      },
      select: { id: true, email: true },
    });
  } catch (error) {
    const failure = registrationDatabaseFailure(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }

  const verificationLink = `${validAppOrigin(request)}/verify-email?token=${encodeURIComponent(rawToken)}`;
  try {
    await sendEmail(
      user.email,
      "Verify your CodeMind AI email",
      `Confirm your email address within 30 minutes by opening this link:\n\n${verificationLink}\n\nIf you did not create this account, ignore this message.`,
    );
  } catch {
    return NextResponse.json({
      error: "Your account was saved but the verification email could not be delivered. Check RESEND_API_KEY and EMAIL_FROM, then use resend verification.",
      code: "VERIFICATION_EMAIL_DELIVERY_FAILED",
    }, { status: 503 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
