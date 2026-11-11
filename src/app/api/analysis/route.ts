import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AnalysisServiceError, runAnalysis, type Finding } from "@/lib/analysis";
import {consumeRateLimit,sameOrigin,readJsonBounded} from "@/lib/rate-limit";
const schema = z.object({ source: z.string().min(1).max(100_000), language: z.enum(["Python","C++","Java","JavaScript"]), sourceName: z.string().max(180).optional(), projectId: z.string().optional() });
export const maxDuration = 30;
// Analyzer labels are user-facing; persist only values in PostgreSQL's enum.
// In particular, uppercasing "Informational" yields invalid "INFORMATIONAL".
const databaseSeverity: Record<Finding["severity"], "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"> = {
  Critical: "CRITICAL", High: "HIGH", Medium: "MEDIUM", Low: "LOW",
  Informational: "INFO", Info: "INFO",
};

function safeDatabaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown; constructor?: { name?: string } };
  // Log only Prisma's stable error code, never its message or metadata.
  return candidate.constructor?.name === "PrismaClientKnownRequestError" &&
    typeof candidate.code === "string" && /^P\d{4}$/.test(candidate.code)
    ? candidate.code : undefined;
}

export async function POST(request: Request) {
  if(!sameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error:"Sign in to save an analysis." }, { status:401 });if(!await consumeRateLimit(`analysis:${session.user.id}`,20,60_000))return NextResponse.json({error:"Too many analysis requests. Try again in a minute."},{status:429});
  let stage = "request_validation";
  try {
    const parsed = schema.safeParse(await readJsonBounded(request,110_000)); if (!parsed.success) return NextResponse.json({error:"Invalid analysis request."},{status:400});
    stage = "usage_limit_check";
    const since=new Date(Date.now()-24*60*60*1000);const used=await prisma.usageRecord.count({where:{userId:session.user.id,kind:"analysis",createdAt:{gte:since}}});if(used>=100)return NextResponse.json({error:"Daily analysis limit reached. Try again later."},{status:429});
    const {source, language, sourceName, projectId}=parsed.data;
    stage = "project_ownership_check";
    if(projectId && !await prisma.project.findFirst({where:{id:projectId,userId:session.user.id},select:{id:true}})) return NextResponse.json({error:"Project not found."},{status:404});
    stage = "analysis_service";
    const report=await runAnalysis(source,language);
    stage = "database_save";
    const [analysis]=await prisma.$transaction([prisma.analysisRun.create({data:{userId:session.user.id,projectId,language,sourceName,sourceCode:source,score:report.quality_score,method:report.analysis_method,metrics:report.metrics as object,findings:{create:report.findings.map(f=>({title:f.title,severity:databaseSeverity[f.severity],message:f.message,line:f.line,lineEnd:f.line_end,source:"static",suggestion:f.suggestion||null,suggestedCode:f.suggested_code||null}))},report:{create:{summary:`${report.findings.length} finding(s) from configured static checks.`,recommendations:report.recommendations,scoreExplanation:report.score_explanation as object,limitations:report.limitations}}},include:{findings:true,report:true}}),prisma.usageRecord.create({data:{userId:session.user.id,kind:"analysis"}})]);
    return NextResponse.json({id:analysis.id,report});
  } catch (error) {
    if(error instanceof RangeError)return NextResponse.json({error:error.message},{status:413});
    if(error instanceof SyntaxError)return NextResponse.json({error:"Malformed request body."},{status:400});
    const errorKind = error instanceof AnalysisServiceError ? error.kind : "internal";
    console.error("[analysis] request failed", { stage, errorKind, errorName:error instanceof Error?error.name:"UnknownError", ...(stage === "database_save" ? { databaseCode: safeDatabaseErrorCode(error) } : {}) });
    if(error instanceof AnalysisServiceError)return NextResponse.json({error:error.message},{status:503});
    if(stage === "database_save")return NextResponse.json({error:"The analysis completed, but its report could not be saved. Please retry."},{status:503});
    return NextResponse.json({error:"Analysis could not be completed. Please retry."},{status:503});
  }
}
