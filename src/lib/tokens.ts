import {createHash,randomBytes} from "node:crypto";
export function createRawToken(){return randomBytes(32).toString("base64url");}
export function hashToken(token:string){return createHash("sha256").update(token).digest("hex");}
export function validAppOrigin(request:Request){const configured=process.env.NEXT_PUBLIC_APP_URL;if(!configured)return new URL(request.url).origin;try{return new URL(configured).origin;}catch{return new URL(request.url).origin;}}
