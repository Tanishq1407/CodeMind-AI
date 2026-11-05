import {Workspace} from "@/components/workspace";import Link from "next/link";
export const metadata={title:"Analyze code"};export default function Page(){return <><header className="nav"><div className="wrap navin"><Link href="/" className="brand"><img src="/brand/codemind-mark.svg" alt=""/>CodeMind AI</Link><Link href="/dashboard" className="btn">Dashboard</Link></div></header><Workspace/></>}
