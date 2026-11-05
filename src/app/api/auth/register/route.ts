import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
const schema = z.object({ username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/), email: z.email().max(254), password: z.string().min(10).max(128) });
export async function POST(request: Request) {
  try {
    const body = schema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Check your username, email, and password (10+ characters)." }, { status: 400 });
    const { username, email, password } = body.data;
    const normalized = email.toLowerCase();
    const existing = await prisma.user.findFirst({ where: { OR: [{ email: normalized }, { username }] }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "Unable to create this account. Check the details or sign in." }, { status: 409 });
    await prisma.user.create({ data: { name: username, username, email: normalized, passwordHash: await hash(password, 12) } });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch { return NextResponse.json({ error: "Account creation is temporarily unavailable." }, { status: 503 }); }
}
