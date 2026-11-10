import {NextResponse} from "next/server";
import {z} from "zod";
import {auth} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {sameOrigin,readJsonBounded} from "@/lib/rate-limit";
const schema=z.object({name:z.string().trim().min(1).max(80),description:z.string().max(500).optional()});
export async function GET(){const session=await auth();if(!session?.user?.id)return NextResponse.json({error:"Sign in required."},{status:401});const projects=await prisma.project.findMany({where:{userId:session.user.id},orderBy:{updatedAt:"desc"},include:{_count:{select:{files:true,analyses:true}}}});return NextResponse.json({projects});}
export async function POST(request:Request){if(!sameOrigin(request))return NextResponse.json({error:"Request origin could not be verified."},{status:403});const session=await auth();if(!session?.user?.id)return NextResponse.json({error:"Sign in required."},{status:401});let body:unknown;try{body=await readJsonBounded(request,2000);}catch{return NextResponse.json({error:"Malformed request body."},{status:400});}const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:"Invalid project details."},{status:400});const project=await prisma.project.create({data:{...parsed.data,userId:session.user.id}});return NextResponse.json({project},{status:201});}
