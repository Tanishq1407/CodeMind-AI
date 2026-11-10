import {NextResponse} from "next/server";import {z} from "zod";import {auth} from "@/lib/auth";import {prisma} from "@/lib/prisma";import {completeWithAi,type AiMessage} from "@/lib/ai-provider";import {consumeRateLimit,readJsonBounded,sameOrigin} from "@/lib/rate-limit";
const schema=z.object({prompt:z.string().trim().min(1).max(4000),conversationId:z.string().optional(),analysisId:z.string().optional(),codeContext:z.string().max(100_000).optional(),language:z.enum(["Python","C++","Java","JavaScript"]).optional()});
export async function POST(request:Request){
  if(!sameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
  const session=await auth();if(!session?.user?.id)return NextResponse.json({error:"Sign in to use the assistant."},{status:401});if(!await consumeRateLimit(`assistant:${session.user.id}`,5,60_000))return NextResponse.json({error:"Too many assistant requests. Try again in a minute."},{status:429});
  let body:unknown;try{body=await readJsonBounded(request,110_000);}catch{return NextResponse.json({error:"Malformed or oversized request body."},{status:413});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:"Enter a question up to 4,000 characters and attach only supported context."},{status:400});
  const since=new Date(Date.now()-24*60*60*1000),used=await prisma.usageRecord.count({where:{userId:session.user.id,kind:"ai_message",createdAt:{gte:since}}});if(used>=20)return NextResponse.json({error:"Daily AI message limit reached. Try again later."},{status:429});
  try{
    let conversationId=parsed.data.conversationId;let prior:AiMessage[]=[];
    if(conversationId){const conversation=await prisma.conversation.findFirst({where:{id:conversationId,userId:session.user.id},select:{id:true}});if(!conversation)return NextResponse.json({error:"Conversation not found."},{status:404});const rows=await prisma.aiMessage.findMany({where:{conversationId},orderBy:{position:"desc"},take:10,select:{role:true,content:true}});prior=rows.reverse().map(m=>({role:m.role.toLowerCase() as "user"|"assistant",content:m.content.slice(-4000)}));}
    let context="";
    if(parsed.data.analysisId){const analysis=await prisma.analysisRun.findFirst({where:{id:parsed.data.analysisId,userId:session.user.id},include:{findings:true}});if(!analysis)return NextResponse.json({error:"Analysis not found."},{status:404});context+=`\n\nUser-selected saved analysis (${analysis.language}, ${analysis.method}):\n${JSON.stringify({score:analysis.score,metrics:analysis.metrics,findings:analysis.findings.map(f=>({severity:f.severity,title:f.title,message:f.message,line:f.line}))})}\nSource code:\n${analysis.sourceCode}`;}
    if(parsed.data.codeContext)context+=`\n\nUser-provided ${parsed.data.language||"source"} code context:\n${parsed.data.codeContext}`;
    const userContent=`${parsed.data.prompt}${context}`;const answer=await completeWithAi([...prior,{role:"user",content:userContent}]);
    const created=conversationId?{id:conversationId}:await prisma.conversation.create({data:{userId:session.user.id,title:parsed.data.prompt.slice(0,80)||"Code question"},select:{id:true}});const finalConversationId=created.id;
    await prisma.$transaction([prisma.aiMessage.create({data:{conversationId:finalConversationId,role:"USER",content:userContent}}),prisma.aiMessage.create({data:{conversationId:finalConversationId,role:"ASSISTANT",content:answer}}),prisma.usageRecord.create({data:{userId:session.user.id,kind:"ai_message"}}),prisma.conversation.update({where:{id:finalConversationId},data:{updatedAt:new Date()}})]);
    return NextResponse.json({conversationId:finalConversationId,answer});
  }catch{return NextResponse.json({error:"AI service is unavailable or misconfigured. Your conversation was not saved."},{status:503});}
}
