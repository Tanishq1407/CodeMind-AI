import os
import json
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from database.db import Database
from auth.auth_service import AuthService
from analyzer import CodeAnalyzer
from ui.components import (
    inject_custom_styles,
    render_navbar,
    render_metric_card,
    render_finding_item,
    render_activity_heatmap
)

# Page configuration
st.set_page_config(
    page_title="CodeMind AI — Developer Code Quality Platform",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Persistent DB and Service Initializations
@st.cache_resource
def get_database():
    return Database()

@st.cache_resource
def get_auth_service():
    return AuthService(get_database())

@st.cache_resource
def get_analyzer():
    return CodeAnalyzer()

db = get_database()
auth_svc = get_auth_service()
analyzer = get_analyzer()

# Initialize Session State
if "authenticated" not in st.session_state:
    st.session_state.authenticated = False
if "user" not in st.session_state:
    st.session_state.user = None
if "auth_mode" not in st.session_state:
    st.session_state.auth_mode = "login"  # 'login' or 'register'
if "active_nav" not in st.session_state:
    st.session_state.active_nav = "Dashboard"

# Load Preferences if authenticated
user_prefs = {"theme": "dark", "accent_color": "#6366f1", "preferred_language": "Python", "retain_source_code": True}
if st.session_state.authenticated and st.session_state.user:
    user_prefs = db.get_preferences(st.session_state.user["id"])

# Inject polished styling
inject_custom_styles(theme=user_prefs["theme"], accent_color=user_prefs["accent_color"])


# ==========================================
# PUBLIC AUTHENTICATION SCREENS (Logged Out)
# ==========================================
def render_auth_page():
    st.markdown("<div style='height: 40px;'></div>", unsafe_allow_html=True)
    c1, col, c2 = st.columns([1, 1.8, 1])

    with col:
        # Header Brand Logo
        st.markdown(
            """
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; background: linear-gradient(135deg, #6366f1, #a855f7); width: 56px; height: 56px; border-radius: 16px; line-height: 56px; font-weight: 900; color: white; font-size: 1.6rem; margin-bottom: 12px; box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3);">
                    &lt;/&gt;
                </div>
                <h1 style="font-weight: 900; font-size: 2.2rem; margin: 0; letter-spacing: -0.5px;">Code<span style="color: #818cf8;">Mind</span> AI</h1>
                <p style="color: #94a3b8; font-size: 0.95rem; margin-top: 6px;">Next-Gen Code Quality, Complexity Analysis &amp; Developer Growth</p>
            </div>
            """,
            unsafe_allow_html=True
        )

        with st.container():
            mode_tab = st.radio(
                "Mode",
                ["Sign In", "Create Account"],
                index=0 if st.session_state.auth_mode == "login" else 1,
                horizontal=True,
                label_visibility="collapsed"
            )
            st.session_state.auth_mode = "login" if mode_tab == "Sign In" else "register"

            if st.session_state.auth_mode == "login":
                st.markdown("### Sign In to your Account")
                with st.form("login_form", clear_on_submit=False):
                    identifier = st.text_input("Username or Email", placeholder="e.g. dev_jane or jane@example.com")
                    password = st.text_input("Password", type="password", placeholder="Enter your password")
                    submit = st.form_submit_button("Sign In", use_container_width=True, type="primary")

                    if submit:
                        success, message, user_info = auth_svc.login(identifier, password)
                        if success:
                            st.session_state.authenticated = True
                            st.session_state.user = user_info
                            st.success("Welcome back! Redirecting...")
                            st.rerun()
                        else:
                            st.error(message)

            else:
                st.markdown("### Create your Private Account")
                with st.form("register_form", clear_on_submit=False):
                    username = st.text_input("Username", placeholder="3-30 chars (letters, numbers, _, -)")
                    email = st.text_input("Email", placeholder="you@domain.com")
                    password = st.text_input("Password", type="password", placeholder="Min 8 chars, 1 uppercase, 1 lowercase, 1 number")
                    confirm_password = st.text_input("Confirm Password", type="password", placeholder="Repeat your password")
                    submit = st.form_submit_button("Register Account", use_container_width=True, type="primary")

                    if submit:
                        success, message, user_id = auth_svc.register(username, email, password, confirm_password)
                        if success:
                            st.success(message)
                            st.info("Please switch to 'Sign In' to log in.")
                        else:
                            st.error(message)


# ==========================================
# AUTHENTICATED SECTIONS
# ==========================================
def render_dashboard(user_id: int, user_info: dict):
    stats = db.get_user_stats(user_id)
    recent = db.get_user_submissions(user_id, limit=5)

    st.markdown("## Overview")

    col1, col2, col3, col4 = st.columns(4)
    with col1:
        render_metric_card("Total Analyses", stats["total_analyses"], "Saved across all time")
    with col2:
        render_metric_card("Avg Quality Score", f"{stats['avg_score']}/100", "Heuristic assessment")
    with col3:
        render_metric_card("Avg Complexity", stats["avg_complexity"], "Cyclomatic branch score")
    with col4:
        render_metric_card("Total Lines Evaluated", f"{stats['total_loc']:,}", "Lines of code")

    if stats["total_analyses"] == 0:
        st.markdown(
            """
            <div style="background-color: #1e293b; border: 1px dashed #475569; border-radius: 14px; padding: 40px; text-align: center; margin: 24px 0;">
                <div style="font-size: 2.5rem; margin-bottom: 12px;">🚀</div>
                <h3 style="font-weight: 800; margin-bottom: 8px;">No Code Analyses Yet</h3>
                <p style="color: #94a3b8; max-width: 500px; margin: 0 auto 20px auto;">
                    Submit your first Python or C++ snippet to inspect structural metrics, cyclomatic complexity, code smells, and actionable improvements.
                </p>
            </div>
            """,
            unsafe_allow_html=True
        )
        if st.button("Analyze Your First Code Snippet →", type="primary"):
            st.session_state.active_nav = "Analyze Code"
            st.rerun()
    else:
        # Mini Recent Activity Chart
        st.markdown("### Recent Submissions")
        table_rows = []
        for r in recent:
            table_rows.append({
                "Date": str(r["created_at"])[:16],
                "Language": r["language"],
                "Quality Score": f"{r['quality_score']}/100",
                "LOC": r["total_lines"],
                "Complexity": r["cyclomatic_complexity"],
                "Issues Found": len(r["findings"])
            })
        st.dataframe(pd.DataFrame(table_rows), use_container_width=True, hide_index=True)


def render_analyze_code(user_id: int, user_prefs: dict):
    st.markdown("## Analyze Code")
    st.caption("Inspect structural health, cyclomatic complexity, code smells, and refactoring guidelines.")

    col1, col2 = st.columns([1, 2])
    with col1:
        lang = st.selectbox("Programming Language", ["Python", "C++"], index=0 if user_prefs.get("preferred_language") == "Python" else 1)
        input_method = st.radio("Input Method", ["Paste / Editor", "Upload File"], horizontal=True)

    default_python = '''def calculate_discount(price, customer_type, loyalty_years):\n    # Calculates special customer discounts\n    if price <= 0:\n        return 0.0\n    \n    discount = 0.0\n    if customer_type == "VIP":\n        if loyalty_years > 5:\n            discount = 0.25\n        else:\n            discount = 0.15\n    elif customer_type == "REGULAR":\n        if loyalty_years > 3:\n            discount = 0.08\n    else:\n        discount = 0.0\n        \n    return round(price * (1 - discount), 2)\n'''

    default_cpp = '''#include <iostream>\n#include <vector>\nusing namespace std;\n\nvoid processNumbers(vector<int> nums) {\n    int* rawArr = new int[nums.size()];\n    for (size_t i = 0; i < nums.size(); ++i) {\n        if (nums[i] > 0) {\n            if (nums[i] % 2 == 0) {\n                rawArr[i] = nums[i] * 2;\n            }\n        }\n    }\n    delete[] rawArr;\n}\n'''

    default_code = default_python if lang == "Python" else default_cpp
    code_to_analyze = ""

    if input_method == "Paste / Editor":
        code_to_analyze = st.text_area("Source Code", value=default_code, height=280)
    else:
        uploaded_file = st.file_uploader("Upload Source File", type=["py", "cpp", "cxx", "cc", "h", "hpp"])
        if uploaded_file is not None:
            # File size safety limit: max 1MB
            if uploaded_file.size > 1024 * 1024:
                st.error("Uploaded file exceeds 1MB limit. Please upload a smaller code file.")
            else:
                try:
                    code_to_analyze = uploaded_file.getvalue().decode("utf-8")
                    st.code(code_to_analyze[:400] + ("\n..." if len(code_to_analyze) > 400 else ""), language=lang.lower())
                except Exception as e:
                    st.error(f"Failed to read file: {e}")

    run_analysis = st.button("Run Static Analysis ⚡", type="primary", use_container_width=True)

    if run_analysis:
        if not code_to_analyze or not code_to_analyze.strip():
            st.warning("Please provide non-empty source code to analyze.")
            return

        with st.spinner("Executing static analysis..."):
            result = analyzer.analyze(code_to_analyze, language=lang)

        if not result["success"]:
            st.error(result.get("error", "Analysis failed."))
            if result.get("findings"):
                for f in result["findings"]:
                    render_finding_item(f)
            return

        metrics = result["metrics"]
        findings = result["findings"]
        score = result["quality_score"]

        # Persist submission respecting user privacy preference
        retain_code = user_prefs.get("retain_source_code", True)
        saved_source = code_to_analyze if retain_code else None

        sub_id = db.save_submission(
            user_id=user_id,
            language=lang,
            source_code=saved_source,
            quality_score=score,
            total_lines=metrics.get("total_lines", 0),
            cyclomatic_complexity=metrics.get("cyclomatic_complexity", 1.0),
            functions_count=metrics.get("functions_count", 0),
            classes_count=metrics.get("classes_count", 0),
            max_nesting_depth=metrics.get("max_nesting_depth", 0),
            findings=findings,
            metrics=metrics
        )

        st.success(f"Analysis complete! Submission #{sub_id} saved to your private history.")

        # Display Metrics Dashboard
        st.markdown("### Analysis Results")
        mcol1, mcol2, mcol3, mcol4, mcol5 = st.columns(5)
        with mcol1:
            render_metric_card("Quality Score", f"{score}/100", "Transparent formula")
        with mcol2:
            render_metric_card("Total Lines", metrics.get("total_lines", 0), f"{metrics.get('sloc', 0)} SLOC")
        with mcol3:
            render_metric_card("Complexity", metrics.get("cyclomatic_complexity", 1.0), "Branch points")
        with mcol4:
            render_metric_card("Max Nesting", f"{metrics.get('max_nesting_depth', 0)} lvls", "Block depth")
        with mcol5:
            render_metric_card("Functions / Classes", f"{metrics.get('functions_count', 0)} / {metrics.get('classes_count', 0)}", "Declared units")

        # Actionable Findings
        st.markdown(f"### Findings & Recommendations ({len(findings)})")
        if not findings:
            st.info("Clean code! No major structural smells or complexity violations detected.")
        else:
            for f in findings:
                render_finding_item(f)

        # Exportable Reports
        st.markdown("### Export Analysis Report")
        exp1, exp2 = st.columns(2)
        with exp1:
            json_report = json.dumps(result, indent=2)
            st.download_button(
                "Download JSON Report",
                data=json_report,
                file_name=f"codemind_report_{lang.lower()}.json",
                mime="application/json",
                use_container_width=True
            )
        with exp2:
            df_report = pd.DataFrame([{
                "Language": lang,
                "Score": score,
                "Lines": metrics.get("total_lines", 0),
                "Complexity": metrics.get("cyclomatic_complexity", 1.0),
                "Nesting": metrics.get("max_nesting_depth", 0),
                "IssuesCount": len(findings)
            }])
            st.download_button(
                "Download CSV Summary",
                data=df_report.to_csv(index=False),
                file_name=f"codemind_summary_{lang.lower()}.csv",
                mime="text/csv",
                use_container_width=True
            )


def render_coding_activity(user_id: int, user_prefs: dict):
    st.markdown("## Coding Activity Heatmap")
    st.caption("Visualizing your private daily code quality analysis frequency, inspired by GitHub's contribution matrix.")

    is_dark = (user_prefs.get("theme", "dark") == "dark")
    records = db.get_activity_heatmap_data(user_id)

    render_activity_heatmap(records, year=2026, is_dark=is_dark)

    if not records:
        st.info("No activity recorded in 2026 yet. Run analyses in the 'Analyze Code' section to populate your heatmap!")
    else:
        total_days = len(records)
        total_subs = sum(int(r["count"]) for r in records)
        c1, c2 = st.columns(2)
        with c1:
            render_metric_card("Active Days", total_days, "Days with at least 1 analysis")
        with c2:
            render_metric_card("Total Analyses", total_subs, "Year to date")


def render_my_progress(user_id: int):
    st.markdown("## My Progress & Trends")
    st.caption("Longitudinal tracking of quality scores, complexity, and codebase scale across your submissions.")

    subs = db.get_user_submissions(user_id, limit=50)
    if len(subs) < 2:
        st.info("Progress trends require at least 2 code analyses to establish a comparative baseline.")
        return

    # Invert to chronological order for trends
    subs_chronological = list(reversed(subs))
    data = []
    for idx, s in enumerate(subs_chronological, 1):
        data.append({
            "Submission": f"#{idx}",
            "Date": str(s["created_at"])[:16],
            "Quality Score": s["quality_score"],
            "Complexity": s["cyclomatic_complexity"] or 1.0,
            "Total Lines": s["total_lines"],
            "Max Nesting": s["max_nesting_depth"],
            "Language": s["language"]
        })

    df = pd.DataFrame(data)

    c1, c2 = st.columns(2)
    with c1:
        fig1 = px.line(df, x="Submission", y="Quality Score", title="Quality Score Progression (0-100)", markers=True, color_discrete_sequence=["#22c55e"])
        fig1.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", yaxis=dict(range=[0, 105]))
        st.plotly_chart(fig1, use_container_width=True)

    with c2:
        fig2 = px.line(df, x="Submission", y="Complexity", title="Cyclomatic Complexity Trend", markers=True, color_discrete_sequence=["#f97316"])
        fig2.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)")
        st.plotly_chart(fig2, use_container_width=True)

    # Historical Submissions Table
    st.markdown("### Submission History")
    st.dataframe(df[["Submission", "Date", "Language", "Quality Score", "Complexity", "Total Lines", "Max Nesting"]], use_container_width=True, hide_index=True)


def render_coding_insights(user_id: int):
    st.markdown("## Coding Insights")
    st.caption("Evidence-based diagnostic patterns aggregated from your actual historical analyses.")

    subs = db.get_user_submissions(user_id, limit=100)
    if not subs:
        st.info("No submissions found. Analyze code samples to generate personalized insights.")
        return

    # Aggregate issue categories
    finding_counts = {}
    high_nesting_count = 0
    high_complexity_count = 0

    for s in subs:
        if s.get("max_nesting_depth", 0) > 4:
            high_nesting_count += 1
        if (s.get("cyclomatic_complexity") or 0) > 8:
            high_complexity_count += 1
        for f in s.get("findings", []):
            title = f.get("title", "Observation")
            finding_counts[title] = finding_counts.get(title, 0) + 1

    st.markdown("### Key Observations & Refactoring Priorities")

    col1, col2 = st.columns(2)
    with col1:
        if high_nesting_count > 0:
            pct = round((high_nesting_count / len(subs)) * 100, 1)
            st.warning(f"**Nesting Depth Pattern**: {pct}% of your submissions ({high_nesting_count}/{len(subs)}) have nesting depth > 4 scopes. Consider applying guard clauses and early returns.")
        else:
            st.success("**Nesting Control**: Great job! None of your analyzed snippets exhibit excessive nesting.")

        if high_complexity_count > 0:
            pct = round((high_complexity_count / len(subs)) * 100, 1)
            st.warning(f"**Branch Complexity Pattern**: {pct}% of your submissions have cyclomatic complexity > 8. Try separating branching logic into polymorphic classes or distinct handlers.")
        else:
            st.success("**Branch Simplicity**: Cyclomatic complexity has remained consistently manageable across your code.")

    with col2:
        st.markdown("#### Most Frequent Findings")
        if finding_counts:
            sorted_findings = sorted(finding_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            for title, cnt in sorted_findings:
                st.markdown(f"- **{title}**: detected `{cnt}` times across submissions")
        else:
            st.info("No recurring code smells detected.")


def render_settings(user_id: int, user_info: dict, user_prefs: dict):
    st.markdown("## Settings & Account Management")

    st.markdown("### Preferences")
    with st.form("prefs_form"):
        theme = st.selectbox("Interface Theme", ["dark", "light"], index=0 if user_prefs.get("theme") == "dark" else 1)
        accent = st.color_picker("Accent Color", value=user_prefs.get("accent_color", "#6366f1"))
        pref_lang = st.selectbox("Default Language", ["Python", "C++"], index=0 if user_prefs.get("preferred_language") == "Python" else 1)
        retain_code = st.checkbox("Retain raw source code in private submissions", value=user_prefs.get("retain_source_code", True))
        
        save_prefs = st.form_submit_button("Save Preferences", type="primary")
        if save_prefs:
            db.update_preferences(user_id, theme, accent, pref_lang, retain_code)
            st.success("Preferences updated successfully!")
            st.rerun()

    st.markdown("---")
    st.markdown("### Change Password")
    with st.form("pwd_form"):
        curr_pwd = st.text_input("Current Password", type="password")
        new_pwd = st.text_input("New Password", type="password")
        conf_pwd = st.text_input("Confirm New Password", type="password")
        change_pwd = st.form_submit_button("Update Password")

        if change_pwd:
            succ, msg = auth_svc.change_password(user_id, curr_pwd, new_pwd, conf_pwd)
            if succ:
                st.success(msg)
            else:
                st.error(msg)

    st.markdown("---")
    st.markdown("### Data Privacy & Destructive Actions")
    st.caption("You maintain full control of your private data. Actions here cannot be undone.")

    dcol1, dcol2 = st.columns(2)
    with dcol1:
        if st.button("Clear My Submission History", type="secondary", use_container_width=True):
            if db.delete_user_history(user_id):
                st.success("Analysis history completely cleared.")
                st.rerun()
            else:
                st.error("Failed to clear history.")

    with dcol2:
        # Require explicit confirmation for account deletion
        confirm_del = st.checkbox("I understand deleting my account permanently erases all credentials and submissions.")
        if st.button("Delete My Account", type="primary", use_container_width=True, disabled=not confirm_del):
            if db.delete_user_account(user_id):
                st.session_state.authenticated = False
                st.session_state.user = None
                st.success("Account deleted. Redirecting...")
                st.rerun()


# ==========================================
# MAIN APP ROUTING
# ==========================================
def main():
    if not st.session_state.authenticated or not st.session_state.user:
        render_auth_page()
    else:
        user_info = st.session_state.user
        user_id = user_info["id"]

        # Sidebar navigation
        with st.sidebar:
            st.markdown(
                """
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
                    <div style="background: linear-gradient(135deg, #6366f1, #a855f7); width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; color: white;">
                        &lt;/&gt;
                    </div>
                    <span style="font-size: 1.25rem; font-weight: 900; letter-spacing: -0.5px;">Code<span style="color: #818cf8;">Mind</span> AI</span>
                </div>
                """,
                unsafe_allow_html=True
            )

            nav_options = [
                "Dashboard",
                "Analyze Code",
                "Coding Activity",
                "My Progress",
                "Coding Insights",
                "Settings"
            ]

            selected_nav = st.radio(
                "Navigation",
                nav_options,
                index=nav_options.index(st.session_state.active_nav) if st.session_state.active_nav in nav_options else 0,
                label_visibility="collapsed"
            )
            st.session_state.active_nav = selected_nav

            st.markdown("---")
            st.markdown(f"**User**: `{user_info['username']}`")
            st.caption(f"**Database**: {'PostgreSQL' if db.is_postgres else 'SQLite (Local)'}")

            if st.button("Log Out", use_container_width=True):
                st.session_state.authenticated = False
                st.session_state.user = None
                st.rerun()

        # Render authenticated navbar
        render_navbar(user_info["username"])

        # Page Dispatcher
        if st.session_state.active_nav == "Dashboard":
            render_dashboard(user_id, user_info)
        elif st.session_state.active_nav == "Analyze Code":
            render_analyze_code(user_id, user_prefs)
        elif st.session_state.active_nav == "Coding Activity":
            render_coding_activity(user_id, user_prefs)
        elif st.session_state.active_nav == "My Progress":
            render_my_progress(user_id)
        elif st.session_state.active_nav == "Coding Insights":
            render_coding_insights(user_id)
        elif st.session_state.active_nav == "Settings":
            render_settings(user_id, user_info, user_prefs)

if __name__ == "__main__":
    main()
