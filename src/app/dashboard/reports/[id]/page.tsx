import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findingCategory, recommendedCorrection } from "@/lib/coding-intelligence";

export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const session=await auth(),{id}=await params;
  if(!session?.user?.id)notFound();
  const run=await prisma.analysisRun.findFirst({where:{id,userId:session.user.id},include:{findings:true,report:true}});
  if(!run)notFound();
  const sourceLines=run.sourceCode.split(/\r?\n/);
  return <>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><h1>{run.sourceName||`${run.language} report`}</h1><p className="muted">{run.createdAt.toLocaleString()} · {run.method}</p></div><div style={{display:"flex",gap:8}}><a className="btn" href={`/api/analysis/${run.id}/pdf`}>Download PDF</a><a className="btn" href={`/api/analysis/${run.id}/json`}>Download JSON</a></div></div>
    <div className="metrics"><div className="metric"><small>Heuristic score</small><strong>{run.score}/100</strong></div><div className="metric"><small>Findings</small><strong>{run.findings.length}</strong></div><div className="metric"><small>Language</small><strong style={{fontSize:18}}>{run.language}</strong></div></div>
    <section className="card"><h2 className="report-section-title">Findings</h2><p className="muted report-note">Static analyzer observations. Heuristic findings are signals to review, not confirmed defects.</p>{run.findings.length?run.findings.map(f=>{const snippet=f.line?sourceLines[f.line-1]:undefined;return <details className="find report-finding" key={f.id}><summary><span className="tag">{f.severity}</span><span className="finding-title">{f.title}</span><span className="finding-location">{f.line?`Line ${f.line}`:"Location unavailable"}</span></summary><div className="finding-detail"><div className="finding-meta"><span>{findingCategory(f.title,f.message)}</span><span>{/syntax error/i.test(f.title)?"Parser observation":"Static heuristic"}</span></div><p>{f.message}</p>{snippet!==undefined&&<><small>Source at line {f.line}</small><pre className="finding-code"><code>{String(f.line).padStart(3," ")}  {snippet}</code></pre></>}<h3>Recommended correction</h3><p>{recommendedCorrection(f.title,f.suggestion)}</p></div></details>}):<p className="muted">No configured static findings.</p>}</section>
    <section className="card" style={{marginTop:15}}><h2 className="report-section-title">Recommendations</h2><div className="suggestion-list">{(run.report?.recommendations as string[]|undefined)?.map((x,i)=><details className="suggestion" key={i}><summary><span className="suggestion-index">0{i+1}</span><span>{x}</span></summary><p>Use this as a review prompt alongside the evidence in this report. No source changes are applied automatically.</p></details>)}</div><p className="muted report-note">{run.report?.limitations}</p><details><summary>Original source</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{run.sourceCode}</pre></details></section>
  </>;
}
