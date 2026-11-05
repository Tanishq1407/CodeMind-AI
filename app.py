from __future__ import annotations
import json
from datetime import date, timedelta
from pathlib import Path
import pandas as pd
import plotly.express as px
import streamlit as st
from analysis.analyzer import analyze
from database.store import DB_PATH, clear_history, get_history, initialize, save_analysis

st.set_page_config(page_title="CodeMind AI", page_icon="🧠", layout="wide", initial_sidebar_state="expanded")
if "theme" not in st.session_state: st.session_state.theme = "Dark"
if "accent" not in st.session_state: st.session_state.accent = "#65D6AD"
accent = st.session_state.accent
dark = st.session_state.theme == "Dark"
bg, panel, text, muted = ("#0b1016", "#121a23", "#e8eef4", "#93a3b2") if dark else ("#f4f7fa", "#ffffff", "#17212b", "#5d6c79")
st.markdown(f"""<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
.stApp {{background:{bg}; color:{text}; font-family:'DM Sans',sans-serif}}
h1,h2,h3 {{font-family:'Space Grotesk',sans-serif; letter-spacing:-.03em}}
.block-container {{padding-top:2rem; max-width:1480px}}
[data-testid="stMetric"] {{background:{panel}; border:1px solid #263341; padding:18px 20px; border-radius:16px}}
[data-testid="stMetricLabel"] {{color:{muted}}}
.hero {{padding:24px 28px; border:1px solid #293946; border-radius:20px; background:linear-gradient(120deg,{panel},#17232d); margin-bottom:20px}}
.brand {{color:{accent}; font-weight:700; letter-spacing:.08em; font-size:12px}}
.muted {{color:{muted}}}
button[kind="primary"] {{background:{accent}!important; color:#07110e!important; border:0!important}}
[data-testid="stSidebar"] {{background:{panel}; border-right:1px solid #24313e}}
</style>""", unsafe_allow_html=True)
initialize()

def data():
    rows = get_history()
    for row in rows:
        row["date"] = pd.to_datetime(row["created_at"], utc=True).date()
        row["finding_count"] = len(row["findings"])
    return rows

def metric_cards(rows):
    cols = st.columns(4)
    cols[0].metric("Analyses", len(rows))
    langs = sorted({r["language"] for r in rows})
    cols[1].metric("Languages", len(langs))
    cols[2].metric("Average score", f'{sum(r["score"] for r in rows)/len(rows):.0f}/100' if rows else "—")
    cols[3].metric("Findings", sum(r["finding_count"] for r in rows))

def dataframe(rows):
    if not rows:
        st.info("Nothing here yet. Analyze a code sample to start building your local history.")
        return
    df = pd.DataFrame([{"Date":pd.to_datetime(r["created_at"], utc=True).tz_convert(None), "Language":r["language"],
                        "Score":r["score"], "Findings":r["finding_count"], "Source":r["source_name"] or "Pasted code"} for r in rows])
    st.dataframe(df, use_container_width=True, hide_index=True)

rows = data()
with st.sidebar:
    st.markdown(f'<div class="brand">🧠 CODEMIND AI</div>', unsafe_allow_html=True)
    st.caption("Developer analytics · local-first")
    page = st.radio("Workspace", ["Dashboard", "Analyze Code", "Coding Activity", "My Progress", "Coding Insights", "Settings"], label_visibility="collapsed")
    st.divider()
    st.caption(f"{len(rows)} saved analyses")
    st.caption("Static analysis only · no code uploads")

if page == "Dashboard":
    st.markdown('<div class="hero"><div class="brand">YOUR LOCAL DEVELOPER WORKSPACE</div><h1>Think clearly. Build better.</h1><span class="muted">CodeMind AI turns static analysis into a useful view of your coding practice.</span></div>', unsafe_allow_html=True)
    metric_cards(rows)
    col1, col2 = st.columns([1.5,1])
    with col1:
        st.subheader("Activity & quality")
        if rows:
            df = pd.DataFrame(rows); daily=df.groupby("date",as_index=False).agg(Analyses=("id","count"), Score=("score","mean"))
            fig=px.line(daily,x="date",y=["Analyses","Score"],markers=True,template="plotly_dark" if dark else "plotly_white",color_discrete_sequence=[accent,"#7aa7ff"])
            fig.update_layout(paper_bgcolor="rgba(0,0,0,0)",plot_bgcolor="rgba(0,0,0,0)",legend_title_text="",margin=dict(l=0,r=0,t=10,b=0))
            st.plotly_chart(fig,use_container_width=True)
        else: st.info("Your activity and quality trends will appear after your first analysis.")
    with col2:
        st.subheader("Recent analyses")
        if rows:
            for r in rows[:5]: st.markdown(f"**{r['language']}** · {r['score']}/100  \n<span class='muted'>{r['created_at'][:10]} · {r['finding_count']} findings</span>",unsafe_allow_html=True)
        else: st.info("No analyses saved yet.")
    if st.button("Analyze code now", type="primary"): st.session_state.jump_analyze=True; st.rerun()

elif page == "Analyze Code":
    st.title("Analyze code")
    st.caption("Static analysis only. Your submitted code stays on this device and is never executed or sent to a service.")
    language=st.selectbox("Language",["Python","C++"])
    upload=st.file_uploader("Optional source file",type=["py","cpp","cc","cxx","h","hpp"])
    default=upload.getvalue().decode("utf-8",errors="replace") if upload else ""
    source=st.text_area("Source code",value=default,height=340,placeholder="Paste source code here…",key="source_input")
    if st.button("Run static analysis",type="primary",disabled=not source.strip()):
        with st.spinner("Analyzing source…"):
            report=analyze(source,language)
            record_id=save_analysis(report,upload.name if upload else None)
        st.session_state.last_report=report; st.session_state.last_id=record_id
        st.success("Analysis saved to your local history.")
    report=st.session_state.get("last_report")
    if report:
        st.divider(); st.subheader(f"{report['language']} analysis")
        m=report["metrics"]; cols=st.columns(4)
        cols[0].metric("Quality score",f"{report['quality_score']}/100")
        cols[1].metric("Lines of code",m.get("lines_of_code",0))
        cols[2].metric("Functions",m.get("functions",m.get("functions_estimate","—")))
        cols[3].metric("Findings",len(report["findings"]))
        st.caption(report["analysis_method"]+" · "+report["limitations"])
        with st.expander("Structure and line metrics",expanded=True):
            st.json({**m, "structure":report["structure"]})
        with st.expander("Findings",expanded=True):
            if report["findings"]:
                for f in report["findings"]:
                    badge=f"Line {f['line']} · " if f.get("line") else ""
                    st.warning(f"**{f['severity']} · {f['title']}**  \n{badge}{f['message']}")
            else: st.success("No configured checks were triggered.")
        with st.expander("Recommendations and score"):
            for recommendation in report["recommendations"]: st.markdown(f"- {recommendation}")
            st.json(report["score_explanation"])
        st.download_button("Download JSON report",json.dumps(report,indent=2),file_name="codemind-analysis.json",mime="application/json")

elif page == "Coding Activity":
    st.title("Coding activity"); st.caption("Every count below comes from saved analyses in your local database.")
    today=date.today(); start_default=today-timedelta(days=90)
    c1,c2,c3=st.columns(3); start=c1.date_input("From",start_default); end=c2.date_input("To",today); lang=c3.selectbox("Language",["All","Python","C++"])
    filtered=[r for r in rows if start <= r["date"] <= end and (lang=="All" or r["language"]==lang)]
    if filtered:
        counts=pd.DataFrame(filtered).groupby("date").size().rename("analyses")
        grid=pd.DataFrame({"date":pd.date_range(start,end,freq="D").date}); grid=grid.merge(counts,left_on="date",right_index=True,how="left").fillna({"analyses":0})
        grid["weekday"]=pd.to_datetime(grid["date"]).dt.day_name(); grid["week"]=pd.to_datetime(grid["date"]).dt.strftime("%Y-%U")
        heat=px.density_heatmap(grid,x="week",y="weekday",z="analyses",histfunc="sum",category_orders={"weekday":["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]},color_continuous_scale=["#17232d",accent],template="plotly_dark" if dark else "plotly_white")
        heat.update_layout(paper_bgcolor="rgba(0,0,0,0)",plot_bgcolor="rgba(0,0,0,0)",coloraxis_showscale=False)
        st.plotly_chart(heat,use_container_width=True)
        daily=grid[grid.analyses>0]; st.metric("Active days",len(daily)); st.subheader("Daily analysis counts"); st.dataframe(daily[["date","analyses"]],hide_index=True,use_container_width=True)
    else: st.info("No saved analyses match these filters.")
    st.subheader("Recent activity"); dataframe(filtered[:20])

elif page == "My Progress":
    st.title("My progress")
    if rows:
        metric_cards(rows)
        scores=pd.DataFrame(rows).sort_values("created_at")
        fig=px.line(scores,x="created_at",y="score",color="language",markers=True,template="plotly_dark" if dark else "plotly_white",color_discrete_sequence=[accent,"#7aa7ff"])
        fig.update_layout(paper_bgcolor="rgba(0,0,0,0)",plot_bgcolor="rgba(0,0,0,0)",yaxis_range=[0,100],margin=dict(l=0,r=0,t=10,b=0))
        st.subheader("Score trend"); st.plotly_chart(fig,use_container_width=True)
        dist=pd.DataFrame(rows).groupby("language").size().reset_index(name="analyses")
        st.subheader("Language usage"); st.plotly_chart(px.pie(dist,names="language",values="analyses",hole=.65,template="plotly_dark" if dark else "plotly_white",color_discrete_sequence=[accent,"#7aa7ff"]),use_container_width=True)
        st.subheader("Recent versus previous analysis")
        newest=rows[0]; previous=rows[1] if len(rows)>1 else None
        if previous:
            delta=newest["score"]-previous["score"]
            st.write(f"Latest: **{newest['score']}/100** ({newest['language']}); previous: **{previous['score']}/100** ({previous['language']}); change: **{delta:+d} points**.")
        else: st.info("One more analysis is needed for a comparison.")
        st.subheader("History"); dataframe(rows)
    else: st.info("Analyze code to start tracking your progress.")

elif page == "Coding Insights":
    st.title("Coding insights"); st.caption("Rule and statistics based summaries calculated from your saved history. No machine learning is used.")
    if not rows: st.info("Insights appear once you have saved analyses."); 
    else:
        issues={}
        for r in rows:
            for f in r["findings"]: issues[f["title"]]=issues.get(f["title"],0)+1
        if issues:
            most=max(issues,key=issues.get)
            st.markdown(f"**Most frequent detected issue:** {most} ({issues[most]} occurrence(s) across saved reports).")
            st.caption("Calculated by counting finding titles in each saved analysis; repeated detections in one report count separately.")
            st.bar_chart(pd.DataFrame(issues.items(),columns=["Finding","Occurrences"]).set_index("Finding"))
        else: st.info("No findings have been recorded, so there is no recurring issue pattern yet.")
        ordered=sorted(rows,key=lambda r:r["created_at"],reverse=True); latest=ordered[:5]; earlier=ordered[5:10]
        if latest and earlier:
            a=sum(r["score"] for r in latest)/len(latest); b=sum(r["score"] for r in earlier)/len(earlier)
            st.write(f"Recent average score (up to 5): **{a:.1f}**; preceding group average: **{b:.1f}**; difference: **{a-b:+.1f}**.")
            st.caption("This comparison uses the newest five records and the next five records, when available; it is descriptive, not causal.")
        if issues:
            st.subheader("Suggested next step")
            top=sorted(issues.items(),key=lambda x:x[1],reverse=True)[0][0]
            sample=next((f for r in rows for f in r["findings"] if f["title"]==top),None)
            if sample: st.write(sample["message"])

elif page == "Settings":
    st.title("Settings")
    theme=st.radio("Appearance",["Dark","Light"],horizontal=True,index=0 if st.session_state.theme=="Dark" else 1)
    st.session_state.theme=theme
    st.color_picker("Accent color",key="accent")
    st.caption("Appearance changes apply immediately on rerun.")
    st.subheader("Local data")
    st.code(str(DB_PATH)); st.caption("Analysis history is stored on this Windows user account. Clearing history cannot be undone.")
    if "confirm_clear" not in st.session_state: st.session_state.confirm_clear=False
    if not st.session_state.confirm_clear:
        if st.button("Clear analysis history",type="secondary"): st.session_state.confirm_clear=True; st.rerun()
    else:
        st.warning("This removes all saved analyses from the local database.")
        yes,no=st.columns(2)
        if yes.button("Confirm clear history",type="primary"):
            count=clear_history(); st.session_state.confirm_clear=False; st.session_state.pop("last_report",None); st.success(f"Cleared {count} analysis record(s)."); st.rerun()
        if no.button("Cancel"): st.session_state.confirm_clear=False; st.rerun()
    st.subheader("About")
    st.write("**CodeMind AI · MVP 1.0.0**")
    st.write("Static Python AST checks and approximate C++ lexical heuristics. No code execution, external analysis, authentication, or cloud storage. Future options: richer rule sets, report comparisons, and optional authenticated sync.")
