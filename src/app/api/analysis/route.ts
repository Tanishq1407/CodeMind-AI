import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAnalysis } from "@/lib/analysis";
import {consumeRateLimit,sameOrigin,readJsonBounded} from "@/lib/rate-limit";
const schema = z.object({ source: z.string().min(1).max(100_000), language: z.enum(["Python","C++","Java","JavaScript"]), sourceName: z.string().max(180).optional(), projectId: z.string().optional() });
export async function POST(request: Request) {
  if(!sameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error:"Sign in to save an analysis." }, { status:401 });if(!await consumeRateLimit(`analysis:${session.user.id}`,20,60_000))return NextResponse.json({error:"Too many analysis requests. Try again in a minute."},{status:429});
  try {
    const parsed = schema.safeParse(await readJsonBounded(request,110_000)); if (!parsed.success) return NextResponse.json({error:"Invalid analysis request."},{status:400});
    const since=new Date(Date.now()-24*60*60*1000);const used=await prisma.usageRecord.count({where:{userId:session.user.id,kind:"analysis",createdAt:{gte:since}}});if(used>=100)return NextResponse.json({error:"Daily analysis limit reached. Try again later."},{status:429});
    const {source, language, sourceName, projectId}=parsed.data;
    if(projectId && !await prisma.project.findFirst({where:{id:projectId,userId:session.user.id},select:{id:true}})) return NextResponse.json({error:"Project not found."},{status:404});
    const report=await runAnalysis(source,language);
    const [analysis]=await prisma.$transaction([prisma.analysisRun.create({data:{userId:session.user.id,projectId,language,sourceName,sourceCode:source,score:report.quality_score,method:report.analysis_method,metrics:report.metrics as object,findings:{create:report.findings.map(f=>({title:f.title,severity:f.severity.toUpperCase() as "HIGH"|"MEDIUM"|"LOW"|"INFO",message:f.message,line:f.line,source:"static"}))},report:{create:{summary:`${report.findings.length} finding(s) from configured static checks.`,recommendations:report.recommendations,scoreExplanation:report.score_explanation as object,limitations:report.limitations}}},include:{findings:true,report:true}}),prisma.usageRecord.create({data:{userId:session.user.id,kind:"analysis"}})]);
    return NextResponse.json({id:analysis.id,report});
  } catch (error) {if(error instanceof RangeError)return NextResponse.json({error:error.message},{status:413});if(error instanceof SyntaxError)return NextResponse.json({error:"Malformed request body."},{status:400});const safe=error instanceof Error&&error.message.includes("100 KB")?error.message:"Analysis service is unavailable. Try again later."; return NextResponse.json({error:safe},{status:503}); }
}
