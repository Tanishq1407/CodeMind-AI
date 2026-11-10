import {NextResponse} from "next/server";
import {z} from "zod";
import {auth} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {consumeRateLimit,readJsonBounded,sameOrigin} from "@/lib/rate-limit";
const schema=z.object({name:z.string().trim().min(1).max(180).regex(/^[A-Za-z0-9_. -]+$/).refine(n=>n!=="."&&n!==".."),language:z.enum(["Python","C++","Java","JavaScript"]),content:z.string().min(1).max(100_000)});
const extensions:Record<string,string[]>={Python:["py"],"C++":["cpp","cc","cxx","h","hpp"],Java:["java"],JavaScript:["js","jsx","mjs","cjs"]};
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const session=await auth();if(!session?.user?.id)return NextResponse.json({error:"Sign in required."},{status:401});const {id}=await params;const project=await prisma.project.findFirst({where:{id,userId:session.user.id},select:{id:true}});if(!project)return NextResponse.json({error:"Project not found."},{status:404});const files=await prisma.projectFile.findMany({where:{projectId:id},orderBy:{name:"asc"},select:{id:true,name:true,language:true,updatedAt:true}});return NextResponse.json({files});}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!sameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});
  const session=await auth();if(!session?.user?.id)return NextResponse.json({error:"Sign in required."},{status:401});if(!await consumeRateLimit(`project-file:${session.user.id}`,60,24*60*60*1000))return NextResponse.json({error:"Daily project file save limit reached."},{status:429});const {id:projectId}=await params;
  let body:unknown;try{body=await readJsonBounded(request,110_000);}catch{return NextResponse.json({error:"Malformed or oversized request body."},{status:413});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:"Invalid file details. Use a supported language and source file name."},{status:400});
  const ext=parsed.data.name.toLowerCase().split(".").pop();if(!extensions[parsed.data.language].includes(ext||""))return NextResponse.json({error:"File extension does not match the selected language."},{status:400});
  const owned=await prisma.project.findFirst({where:{id:projectId,userId:session.user.id},select:{id:true}});if(!owned)return NextResponse.json({error:"Project not found."},{status:404});
  try{const file=await prisma.projectFile.upsert({where:{projectId_name:{projectId,name:parsed.data.name}},create:{...parsed.data,projectId},update:{language:parsed.data.language,content:parsed.data.content}});await prisma.project.update({where:{id:projectId},data:{updatedAt:new Date()}});return NextResponse.json({file});}catch{return NextResponse.json({error:"File could not be saved."},{status:503});}
}
