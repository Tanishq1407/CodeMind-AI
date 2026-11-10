import Link from "next/link";
import { BrainCircuit } from "lucide-react";
import { redirect } from "next/navigation";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata={title:"Dashboard"};

export default async function Dashboard(){
  const session=await auth();
  if(!session?.user?.id)redirect("/login");
  const uid=session.user.id,since=new Date(Date.now()-24*60*60*1000);
  const [total,aggregate,findings,recent,languages,analysisToday,aiToday,projects]=await Promise.all([
    prisma.analysisRun.count({where:{userId:uid}}),
    prisma.analysisRun.aggregate({where:{userId:uid},_avg:{score:true}}),
    prisma.analysisFinding.count({where:{analysis:{userId:uid}}}),
    prisma.analysisRun.findMany({where:{userId:uid},orderBy:{createdAt:"desc"},take:6,select:{id:true,language:true,score:true,sourceName:true,createdAt:true,_count:{select:{findings:true}}}}),
    prisma.analysisRun.groupBy({by:["language"],where:{userId:uid},_count:{_all:true}}),
    prisma.usageRecord.count({where:{userId:uid,kind:"analysis",createdAt:{gte:since}}}),
    prisma.usageRecord.count({where:{userId:uid,kind:"ai_message",createdAt:{gte:since}}}),
    prisma.project.count({where:{userId:uid}}),
  ]);
  return <>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:15}}>
      <div><p className="muted" style={{fontSize:12,margin:"0 0 5px"}}>YOUR PRIVATE WORKSPACE</p><h1>Good to see you, {session.user.name||"there"}.</h1><p className="muted">Your activity reflects saved analyses in your account.</p></div>
      <Link href="/workspace" className="btn primary">Analyze code</Link>
    </div>
    <div className="metrics">
      <div className="metric"><small>Total analyses</small><strong>{total}</strong></div>
      <div className="metric"><small>Average score</small><strong>{aggregate._avg.score===null?"—":Math.round(aggregate._avg.score)}</strong></div>
      <div className="metric"><small>Findings recorded</small><strong>{findings}</strong></div>
      <div className="metric"><small>Languages</small><strong>{languages.length}</strong></div>
      <div className="metric"><small>Analysis usage · 24h</small><strong style={{fontSize:20}}>{analysisToday} / 100</strong></div>
      <div className="metric"><small>AI usage · 24h</small><strong style={{fontSize:20}}>{aiToday} / 20</strong></div>
      <div className="metric"><small>Projects</small><strong>{projects}</strong></div>
    </div>
    <ActivityHeatmap/>
    <Link className="card intelligence-teaser" href="/dashboard/intelligence"><span className="intelligence-mark"><BrainCircuit size={17}/></span><span className="teaser-copy"><strong>Your Coding Intelligence</strong><small>Explore recurring patterns and score trends from your {total} saved {total===1?"analysis":"analyses"}.</small></span><span className="teaser-link">View report →</span></Link>
    <div className="grid3" style={{gridTemplateColumns:"1.5fr 1fr",marginTop:15}}>
      <section className="card"><h3>Recent analyses</h3>{recent.length?<table className="table"><thead><tr><th>Source</th><th>Language</th><th>Score</th><th>Findings</th></tr></thead><tbody>{recent.map(r=><tr key={r.id}><td><Link href={`/dashboard/reports/${r.id}`}>{r.sourceName||"Pasted source"}</Link></td><td>{r.language}</td><td>{r.score}</td><td>{r._count.findings}</td></tr>)}</tbody></table>:<div style={{padding:"22px 0"}}><p className="muted">No saved analysis yet. Start with a source file to build your history.</p><Link href="/workspace" className="btn">Open analyzer</Link></div>}</section>
      <section className="card"><h3>Language usage</h3>{languages.length?languages.map(l=><p key={l.language} style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span>{l.language}</span><span className="muted">{l._count._all} analyses</span></p>):<p className="muted">Language summaries appear after your first analysis.</p>}<p className="muted" style={{borderTop:"1px solid #303240",paddingTop:12,fontSize:12}}>Daily limits reset on a rolling 24-hour window.</p></section>
    </div>
  </>;
}
