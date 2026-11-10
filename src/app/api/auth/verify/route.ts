import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, readJsonBounded, requestIp, sameOrigin } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";
import { registrationDatabaseLogMetadata } from "@/lib/registration-config";

export const runtime = "nodejs";
const invalidLink = { error: "This verification link is invalid or expired.", code: "INVALID_OR_EXPIRED_TOKEN" };

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified.", code: "INVALID_ORIGIN" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await readJsonBounded(request, 1000);
  } catch {
    return NextResponse.json(invalidLink, { status: 400 });
  }
  const parsed = z.object({ token: z.string().min(20).max(100) }).safeParse(payload);
  if (!parsed.success) return NextResponse.json(invalidLink, { status: 400 });

  let stage = "rate_limit";
  try {
    const allowed = await consumeRateLimit(`verify-completion-ip:${requestIp(request)}`, 30, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many verification attempts. Please try again later.", code: "RATE_LIMITED" }, { status: 429 });
    }

    stage = "token_lookup";
    const now = new Date();
    const tokenHash = hashToken(parsed.data.token);
    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true },
    });
    if (!record || record.expiresAt <= now) return NextResponse.json(invalidLink, { status: 400 });

    stage = "token_consume";
    const verified = await prisma.$transaction(async (tx) => {
      const user = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "User" WHERE "id" = ${record.userId} FOR UPDATE
      `;
      if (!user[0]) return false;
      const removed = await tx.emailVerificationToken.deleteMany({ where: { id: record.id, expiresAt: { gt: now } } });
      if (!removed.count) return false;
      await tx.user.update({ where: { id: record.userId }, data: { emailVerified: now } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
      return true;
    });

    return verified
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "This verification link has already been used.", code: "TOKEN_ALREADY_USED" }, { status: 400 });
  } catch (error) {
    console.error("[auth/verify] Verification failed", registrationDatabaseLogMetadata(error, stage));
    return NextResponse.json({ error: "Verification service is temporarily unavailable.", code: "VERIFICATION_UNAVAILABLE" }, { status: 503 });
  }
}
