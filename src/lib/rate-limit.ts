import {createHmac} from "node:crypto";
import {prisma} from "@/lib/prisma";

function hashBucket(bucket:string){const secret=process.env.AUTH_SECRET;if(!secret)throw new Error("AUTH_SECRET is required");return createHmac("sha256",secret).update(bucket).digest("hex");}
export async function consumeRateLimit(bucket:string,limit:number,windowMs:number){
  const key=hashBucket(bucket),now=new Date(),expiresAt=new Date(now.getTime()+windowMs);
  await prisma.$executeRaw`INSERT INTO "RateLimitEntry" ("key","count","expiresAt","updatedAt") VALUES (${key},1,${expiresAt},${now}) ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "RateLimitEntry"."expiresAt" <= ${now} THEN 1 ELSE "RateLimitEntry"."count" + 1 END,"expiresAt"=CASE WHEN "RateLimitEntry"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "RateLimitEntry"."expiresAt" END,"updatedAt"=${now}`;
  const row=await prisma.rateLimitEntry.findUnique({where:{key},select:{count:true}});
  if(Math.random()<0.01) await prisma.rateLimitEntry.deleteMany({where:{expiresAt:{lt:now}}});
  return (row?.count??limit+1)<=limit;
}
export function requestIp(request:Request){return request.headers.get("x-real-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";}
export function sameOrigin(request:Request){const origin=request.headers.get("origin");if(!origin)return false;try{return new URL(origin).origin===new URL(request.url).origin;}catch{return false;}}
export async function readJsonBounded(request:Request,maxBytes:number){const length=Number(request.headers.get("content-length")||0);if(length>maxBytes)throw new RangeError("Request body is too large.");if(!request.body)return {};const reader=request.body.getReader(),parts:Uint8Array[]=[];let total=0;while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw new RangeError("Request body is too large.");}parts.push(value);}const body=new Uint8Array(total);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.byteLength;}return JSON.parse(new TextDecoder().decode(body));}
