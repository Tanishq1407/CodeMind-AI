import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCodingIntelligence, findingCategory } from "@/lib/coding-intelligence";

export const metadata = { title: "Coding intelligence" };

export default async function IntelligencePage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const rows = await prisma.analysisRun.findMany({
    where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, score: true, language: true, createdAt: true, findings: { select: { title: true, severity: true, message: true, line: true } } },
  });
  const data = buildCodingIntelligence(rows);
  return <>
    <div className="intelligence-heading"><div><p className="muted" style={{fontSize:12,margin:"0 0 5px"}}>BASED ON YOUR SAVED ANALYSES</p><h1>Your Coding Intelligence</h1><p className="muted">Patterns and score trends derived from {rows.length} recent saved {rows.length === 1 ? "analysis" : "analyses"}.</p></div><Link href="/workspace" className="btn primary">Analyze code</Link></div>
    {rows.length < 3 ? <section className="card intelligence-empty"><div className="intelligence-mark">CI</div><h2>Build a useful picture over time</h2><p className="muted">After at least three saved analyses, this page can start showing recurring findings and focus areas. Nothing is inferred from sample or shared data.</p><p className="muted">You currently have {rows.length} {rows.length === 1 ? "analysis" : "analyses"}. Your reports remain private to your account.</p><Link href="/workspace" className="btn">Run an analysis</Link></section> : <>
      <div className="metrics"><div className="metric"><small>Analyses considered</small><strong>{rows.length}</strong></div><div className="metric"><small>Recurring finding types</small><strong>{data.recurring.length}</strong></div><div className="metric"><small>Findings recorded</small><strong>{data.categories.reduce((n,x)=>n+x.count,0)}</strong></div><div className="metric"><small>Languages analyzed</small><strong>{new Set(rows.map(x=>x.language)).size}</strong></div></div>
      <div className="intelligence-grid">
        <section className="card"><h2>Recurring patterns</h2><p className="muted">These are repeated static analyzer findings in your saved reports, not predictions of future bugs.</p>{data.recurring.length ? <div className="intelligence-list">{data.recurring.slice(0,8).map(item=><details key={item.title} className="intelligence-item"><summary><span>{item.title}</span><b>{item.count} occurrences</b></summary><div className="evidence-list"><p className="muted">Category: {findingCategory(item.title,rows.flatMap(r=>r.findings.filter(f=>f.title===item.title).map(f=>f.message)).join(" "))}</p><p>Evidence from {item.count} findings across saved analyses.</p>{item.examples.slice().reverse().map(ex=><p className="muted" key={`${ex.id}-${ex.line}`}>{new Date(ex.date).toLocaleDateString()} · {ex.severity}{ex.line ? ` · line ${ex.line}` : ""} · <Link href={`/dashboard/reports/${ex.id}`}>Open report</Link></p>)}</div></details>)}</div> : <p className="muted">No finding type has repeated in the selected history yet.</p>}</section>
        <section className="card"><h2>Focus areas</h2><p className="muted">Ordered by the volume of findings in each category.</p>{data.focus.length ? data.focus.map((item,i)=><article className="focus-card" key={item.category}><span className="focus-index">0{i+1}</span><div><h3>{item.topic}</h3><p className="muted">{item.category} · {item.evidenceCount} finding{item.evidenceCount===1?"":"s"}</p><details><summary>Suggested practice</summary><p>{item.practice}</p></details></div></article>) : <p className="muted">Your saved reports have not recorded focus areas yet.</p>}</section>
      </div>
      <section className="card intelligence-trend"><h2>Score trend</h2>{data.scoreTrend ? <><p className="muted">Average heuristic score in the latest five analyses compared with the five before them. Scores are not an objective industry benchmark.</p><div className="trend-values"><div><small>Previous five</small><strong>{data.scoreTrend.previous.toFixed(1)}</strong></div><span aria-hidden="true">→</span><div><small>Latest five</small><strong>{data.scoreTrend.recent.toFixed(1)}</strong></div><span className={`trend-delta ${data.scoreTrend.delta > 0 ? "positive" : data.scoreTrend.delta < 0 ? "negative" : ""}`}>{data.scoreTrend.delta > 0 ? "+" : ""}{data.scoreTrend.delta.toFixed(1)} points</span></div><p className="muted">{data.scoreTrend.delta > 0 ? "The average score increased" : data.scoreTrend.delta < 0 ? "The average score decreased" : "The average score was unchanged"} between these groups of analyses. This reflects the configured heuristic checks and can change with language or code scope.</p></> : <p className="muted">A score comparison needs at least ten saved analyses so two groups of five can be compared fairly. Current history: {rows.length}.</p>}</section>
    </>}
  </>;
}
