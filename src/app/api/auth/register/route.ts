import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, readJsonBounded, requestIp, sameOrigin } from "@/lib/rate-limit";
import { createRawToken, hashToken, validAppOrigin } from "@/lib/tokens";
import { sendEmail } from "@/lib/email";
import { missingRegistrationConfiguration, registrationDatabaseFailure, registrationDatabaseLogMetadata, registrationEmailConflict, registrationUsernameConflict } from "@/lib/registration-config";

export const runtime = "nodejs";

const password = z.string().min(12).refine(
  (value) => new TextEncoder().encode(value).length <= 72,
  "Password must be at most 72 UTF-8 bytes.",
);
const schema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(24).regex(/^[a-z0-9_]+$/),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
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
  const email = parsed.data.email;
  let passwordHash = "";
  let rawTokenForDelivery = "";
  let user: { id: string; email: string };
  let databaseStage = "rate_limit";
  try {
    const [ipAllowed, emailAllowed] = await Promise.all([
      consumeRateLimit(`register-ip:${requestIp(request)}`, 20, 60 * 60 * 1000),
      consumeRateLimit(`register-email:${email}`, 5, 60 * 60 * 1000),
    ]);
    if (!ipAllowed || !emailAllowed) {
      return NextResponse.json({ error: "Too many attempts. Try again later.", code: "RATE_LIMITED" }, { status: 429 });
    }

    databaseStage = "account_lookup";
    const emailMatch = await prisma.$queryRaw<Array<{ emailVerified: Date | null }>>`
      SELECT "emailVerified" FROM "User"
      WHERE LOWER(BTRIM("email")) = ${email}
      LIMIT 1
    `;
    if (emailMatch[0]) {
      const conflict = registrationEmailConflict(emailMatch[0].emailVerified !== null);
      return NextResponse.json(conflict.body, { status: conflict.status });
    }

    const usernameMatch = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "username" IS NOT NULL AND LOWER(BTRIM("username")) = ${username}
      LIMIT 1
    `;
    if (usernameMatch[0]) {
      const conflict = registrationUsernameConflict();
      return NextResponse.json(conflict.body, { status: conflict.status });
    }

    databaseStage = "password_hash";
    try {
      passwordHash = await hash(plainPassword, 12);
    } catch (error) {
      console.error("[auth/register] Password hashing failed", registrationDatabaseLogMetadata(error, databaseStage));
      return NextResponse.json({ error: "Registration could not be completed. Please try again.", code: "PASSWORD_HASH_FAILED" }, { status: 500 });
    }

    databaseStage = "account_create";
    const rawToken = createRawToken();
    rawTokenForDelivery = rawToken;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
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
    console.error("[auth/register] Database operation failed", registrationDatabaseLogMetadata(error, databaseStage));
    const failure = registrationDatabaseFailure(error);
    if (failure.body.code === "ACCOUNT_ALREADY_EXISTS") {
      try {
        const emailMatch = await prisma.$queryRaw<Array<{ emailVerified: Date | null }>>`
          SELECT "emailVerified" FROM "User"
          WHERE LOWER(BTRIM("email")) = ${email}
          LIMIT 1
        `;
        if (emailMatch[0]) {
          const conflict = registrationEmailConflict(emailMatch[0].emailVerified !== null);
          return NextResponse.json(conflict.body, { status: conflict.status });
        }
        const usernameMatch = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "User"
          WHERE "username" IS NOT NULL AND LOWER(BTRIM("username")) = ${username}
          LIMIT 1
        `;
        if (usernameMatch[0]) {
          const conflict = registrationUsernameConflict();
          return NextResponse.json(conflict.body, { status: conflict.status });
        }
      } catch (resolutionError) {
        console.error("[auth/register] Unique-conflict resolution failed", registrationDatabaseLogMetadata(resolutionError, "unique_conflict_resolution"));
      }
    }
    return NextResponse.json(failure.body, { status: failure.status });
  }

  const verificationLink = `${validAppOrigin(request)}/verify-email?token=${encodeURIComponent(rawTokenForDelivery)}`;
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
