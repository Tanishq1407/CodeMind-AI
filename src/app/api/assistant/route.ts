import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AiProviderError, completeWithAi, type AiMessage } from "@/lib/ai-provider";
import { buildCodingIntelligence } from "@/lib/coding-intelligence";
import { consumeRateLimit, readJsonBounded, sameOrigin } from "@/lib/rate-limit";

const schema = z.object({ prompt: z.string().trim().min(1).max(4000), conversationId: z.string().optional(), analysisId: z.string().optional(), codeContext: z.string().max(100_000).optional(), language: z.enum(["Python", "C++", "Java", "JavaScript"]).optional() });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to use the assistant." }, { status: 401 });
  if (!await consumeRateLimit(`assistant:${session.user.id}`, 5, 60_000)) return NextResponse.json({ error: "Too many assistant requests. Try again in a minute." }, { status: 429 });
  let body: unknown;
  try { body = await readJsonBounded(request, 110_000); } catch { return NextResponse.json({ error: "Malformed or oversized request body." }, { status: 413 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a question up to 4,000 characters and attach only supported context." }, { status: 400 });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let used: number;
  try { used = await prisma.usageRecord.count({ where: { userId: session.user.id, kind: "ai_message", createdAt: { gte: since } } }); }
  catch { console.error("[assistant] usage check failed", { kind: "database" }); return NextResponse.json({ error: "The assistant is temporarily unavailable. Try again later." }, { status: 503 }); }
  if (used >= 20) return NextResponse.json({ error: "Daily AI message limit reached. Try again later." }, { status: 429 });
  try {
    let conversationId = parsed.data.conversationId;
    let prior: AiMessage[] = [];
    if (conversationId) {
      const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId: session.user.id }, select: { id: true } });
      if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      const rows = await prisma.aiMessage.findMany({ where: { conversationId }, orderBy: { position: "desc" }, take: 10, select: { role: true, content: true } });
      prior = rows.reverse().map(m => ({ role: m.role.toLowerCase() as "user" | "assistant", content: m.content.slice(-4000) }));
    }
    let context = "";
    if (parsed.data.analysisId) {
      const analysis = await prisma.analysisRun.findFirst({ where: { id: parsed.data.analysisId, userId: session.user.id }, include: { findings: true } });
      if (!analysis) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
      context += `\n\nUser-selected saved analysis (${analysis.language}, ${analysis.method}):\n${JSON.stringify({ score: analysis.score, metrics: analysis.metrics, findings: analysis.findings.map(f => ({ severity: f.severity, title: f.title, message: f.message, line: f.line })) })}\nSource code:\n${analysis.sourceCode}`;
    }
    if (parsed.data.codeContext) context += `\n\nUser-provided ${parsed.data.language || "source"} code context:\n${parsed.data.codeContext}`;

    // Summarize only compact findings and scores from this authenticated user's own recent history.
    const history = await prisma.analysisRun.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, score: true, language: true, createdAt: true, findings: { take: 15, select: { title: true, severity: true, message: true, line: true } } } });
    if (history.length) {
      const intelligence = buildCodingIntelligence(history);
      const personalContext = {
        analysesConsidered: history.length,
        recurringFindingTypes: intelligence.recurring.slice(0, 5).map(x => ({ title: x.title, occurrences: x.count })),
        focusCategories: intelligence.categories.slice(0, 4),
        scoreTrend: intelligence.scoreTrend ? { priorFiveAverage: Number(intelligence.scoreTrend.previous.toFixed(1)), recentFiveAverage: Number(intelligence.scoreTrend.recent.toFixed(1)), scorePointDelta: Number(intelligence.scoreTrend.delta.toFixed(1)) } : null,
        note: "Derived from saved static reports. Describe it as a heuristic score trend, not a verified measure of programming skill. State when evidence is insufficient.",
      };
      context += `\n\nCompact personal learning context from the user's own saved reports (do not infer beyond this evidence):\n${JSON.stringify(personalContext)}`;
    }
    const userContent = `${parsed.data.prompt}${context}`;
    const answer = await completeWithAi([...prior, { role: "user", content: userContent }]);
    const created = conversationId ? { id: conversationId } : await prisma.conversation.create({ data: { userId: session.user.id, title: parsed.data.prompt.slice(0, 80) || "Code question" }, select: { id: true } });
    conversationId = created.id;
    await prisma.$transaction([
      // Keep private code and generated history context out of the saved chat transcript.
      prisma.aiMessage.create({ data: { conversationId, role: "USER", content: parsed.data.prompt } }),
      prisma.aiMessage.create({ data: { conversationId, role: "ASSISTANT", content: answer } }),
      prisma.usageRecord.create({ data: { userId: session.user.id, kind: "ai_message" } }),
      prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
    ]);
    return NextResponse.json({ conversationId, answer, provider: "configured" });
  } catch (error) {
    if (error instanceof AiProviderError) {
      console.error("[assistant] AI provider request failed", { kind: error.kind, status: error.status });
      if (error.kind === "configuration") return NextResponse.json({ error: "AI assistance is not configured. Set AI_PROVIDER, AI_API_KEY, and AI_MODEL on the server, then restart the app." }, { status: 503 });
      if (error.kind === "timeout") return NextResponse.json({ error: "The AI provider took too long to respond. Please try again." }, { status: 504 });
      return NextResponse.json({ error: "The configured AI provider is unavailable or returned an unsupported response. Try again later." }, { status: 503 });
    }
    console.error("[assistant] request failed", { kind: "internal" });
    return NextResponse.json({ error: "The assistant could not complete this request. Your new message was not saved." }, { status: 503 });
  }
}
