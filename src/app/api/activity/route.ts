import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { readCodingActivity } from "@/lib/coding-activity";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Sign in to view coding activity." }, { status: 401, headers });
    if (!await consumeRateLimit(`activity:${userId}`,30,60_000)) return NextResponse.json({ error: "Too many activity requests. Try again shortly." }, { status: 429, headers });
    const activity = await readCodingActivity(userId);
    return NextResponse.json(activity,{headers});
  } catch (error) {
    console.error("[activity] statistics query failed",{errorName:error instanceof Error?error.name:"UnknownError"});
    return NextResponse.json({ error: "Coding activity is temporarily unavailable." }, { status: 503, headers });
  }
}
