"use client";

import { useEffect, useState } from "react";
import type { ActivityDay, CodingActivity } from "@/lib/coding-activity";

function analysisWord(count:number){return count===1?"analysis":"analyses";}
function activityText(day:ActivityDay){
  const date=new Date(`${day.date}T00:00:00.000Z`);
  const formatted=new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}).format(date);
  return `${formatted} — ${day.count} ${analysisWord(day.count)}`;
}
function monthLabel(date:string){return new Intl.DateTimeFormat("en-US",{month:"short",timeZone:"UTC"}).format(new Date(`${date}T00:00:00.000Z`));}

function MonthGrid({month,days,onSelect,onHover,selectedDate}:{month:string;days:ActivityDay[];onSelect:(day:ActivityDay)=>void;onHover:(day:ActivityDay|null)=>void;selectedDate:string|null}){
  const firstDate=new Date(`${days[0].date}T00:00:00.000Z`);
  const mondayOffset=(firstDate.getUTCDay()+6)%7;
  const columns=Math.ceil((mondayOffset+days.length)/7);
  return <div className="activity-month">
    <span className="activity-month-label">{month}</span>
    <div className="activity-month-grid" role="group" aria-label={`${month} activity`} style={{gridTemplateColumns:`repeat(${columns}, 12px)`}}>
      {days.map((day,index)=><button key={day.date} type="button" className={`activity-cell level-${day.level}${selectedDate===day.date?" selected":""}`} title={activityText(day)} aria-label={activityText(day)} aria-pressed={selectedDate===day.date} style={{gridColumn:Math.floor((mondayOffset+index)/7)+1,gridRow:((mondayOffset+index)%7)+1}} onClick={()=>onSelect(day)} onFocus={()=>onHover(day)} onBlur={()=>onHover(null)} onMouseEnter={()=>onHover(day)} onMouseLeave={()=>onHover(null)}/>) }
    </div>
  </div>;
}

function ActivityGrid({activity}:{activity:CodingActivity}){
  const [selected,setSelected]=useState<ActivityDay|null>(null);
  const [hovered,setHovered]=useState<ActivityDay|null>(null);
  const months=new Map<string,ActivityDay[]>();
  for(const day of activity.days){const key=day.date.slice(0,7);const rows=months.get(key)||[];rows.push(day);months.set(key,rows);}
  const current=hovered||selected;
  return <>
    <div className="activity-grid-heading"><div className="activity-weekdays" aria-hidden="true"><span style={{gridRow:1}}>Mon</span><span style={{gridRow:3}}>Wed</span><span style={{gridRow:5}}>Fri</span></div><div className="activity-months">{[...months.entries()].map(([key,days])=><MonthGrid key={key} month={monthLabel(`${key}-01`)} days={days} selectedDate={selected?.date||null} onHover={setHovered} onSelect={day=>setSelected(value=>value?.date===day.date?null:day)}/>)}</div></div>
    <div className="activity-detail" aria-live="polite">{current?activityText(current):<span>Select a day for its analysis count.</span>}</div>
    <div className="activity-legend" aria-label="Activity levels"><span>Less</span>{[0,1,2,3,4].map(level=><span key={level} className={`activity-cell level-${level}`} aria-label={`Level ${level}`}/>) }<span>More</span></div>
  </>;
}

function Stat({label,value,accent=false}:{label:string;value:number;accent?:boolean}){return <div className="activity-stat"><span>{label}</span><strong className={accent?"activity-stat-accent":""}>{value.toLocaleString()}</strong></div>;}

export function ActivityHeatmap(){
  const [activity,setActivity]=useState<CodingActivity|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError("");
    fetch("/api/activity",{cache:"no-store",signal:controller.signal}).then(async response=>{
      const payload=await response.json();
      if(!response.ok)throw new Error(typeof payload.error==="string"?payload.error:"Activity could not be loaded.");
      return payload as CodingActivity;
    }).then(setActivity).catch(reason=>{
      if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Activity could not be loaded.");
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[attempt]);

  return <section className="activity-card" aria-labelledby="activity-title">
    <div className="activity-header"><div><p className="activity-eyebrow">CONSISTENCY, BUILT ONE SESSION AT A TIME</p><h2 id="activity-title">Coding activity</h2><p className="activity-subtitle">Completed analyses over the past 365 days · UTC</p></div>{activity&&!loading&&<p className="activity-total"><strong>{activity.totalAnalyses.toLocaleString()}</strong> {activity.totalAnalyses===1?"analysis":"analyses"} in the past year</p>}</div>
    {activity&&!loading&&<div className="activity-stats"><Stat label="Active days" value={activity.activeDays}/><Stat label="Current streak" value={activity.currentStreak} accent/><Stat label="Longest streak" value={activity.longestStreak} accent/></div>}
    {loading&&<div className="activity-loading" role="status"><span className="activity-spinner"/>Loading your activity…</div>}
    {!loading&&error&&<div className="activity-error" role="alert"><span>{error}</span><button className="btn" onClick={()=>setAttempt(n=>n+1)}>Retry</button></div>}
    {!loading&&activity&&<><div className="activity-scroll" tabIndex={0} aria-label="Scrollable 365-day coding activity heatmap"><ActivityGrid activity={activity}/></div>{activity.totalAnalyses===0&&<p className="activity-empty">Your first completed analysis will start your activity history and streak.</p>}</>}
  </section>;
}
