import {PrismaClient} from "@prisma/client";
const prisma=new PrismaClient();
async function main(){const email=process.env.ADMIN_EMAIL?.trim().toLowerCase();if(!email){console.log("ADMIN_EMAIL is unset; no administrator was provisioned.");return;}const result=await prisma.user.updateMany({where:{email},data:{role:"ADMIN"}});if(!result.count)console.log("No existing account matched ADMIN_EMAIL. Register that account, then rerun the seed.");else console.log("Administrator role assigned to the configured account.");}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
