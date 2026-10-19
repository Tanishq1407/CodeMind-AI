# CodeMind AI — Developer Code Quality & Insights Platform

[![Tests](https://img.shields.io/badge/tests-19%20passed-brightgreen.svg)]()
[![Python](https://img.shields.io/badge/python-3.11%20%7C%203.12%20%7C%203.13-blue.svg)]()
[![Streamlit](https://img.shields.io/badge/streamlit-1.66%2B-red.svg)]()
[![Security](https://img.shields.io/badge/auth-Argon2id-indigo.svg)]()

**CodeMind AI** is a multi-user code quality platform inspired by LeetCode's clean interface and GitHub's yearly contribution heatmap. It performs deterministic, transparent static source analysis on Python and C++ code, tracks developer quality trends over time, and enforces complete data isolation between accounts.

---

## Architecture Overview

```
CodeMind-AI/
├── app.py                      # Application entry point & session router
├── auth/
│   ├── __init__.py
│   └── auth_service.py         # Argon2id hashing, lockout protection, input validation
├── database/
│   ├── __init__.py
│   └── db.py                   # Dual backend: PostgreSQL (Production) & SQLite (Local dev/tests)
├── analyzer/
│   ├── __init__.py             # Unified static analyzer entry point
│   ├── python_analyzer.py      # Python AST parsing, Radon cyclomatic complexity, code smells
│   └── cpp_analyzer.py         # C++ token analyzer, RAII smart pointer & namespace checks
├── ui/
│   ├── __init__.py
│   └── components.py           # Modern rounded UI cards, badges, and GitHub contribution heatmap
├── tests/
│   ├── test_auth.py            # Registration, login, lockout, and password validation tests
│   ├── test_analyzer.py        # Python & C++ syntax, complexity, and smell tests
│   ├── test_database.py        # Preferences, cascade deletion, and stats tests
│   └── test_isolation.py       # Cross-user data isolation test suite
├── assets/
│   └── logo.svg                # Brain-and-code brand logo
├── .streamlit/
│   └── config.toml             # Theme colors and security options
├── .gitignore
├── .env.example                # Example environment variables (no secrets)
├── requirements.txt            # Pinned dependencies
└── README.md
```

---

## Features

### 1. Genuine Multi-User Authentication & Security
- **Argon2id Password Hashing**: Utilizes industry-standard Argon2id via `argon2-cffi`. No plaintext or reversible credentials are ever stored.
- **Dual Identifier Login**: Users can log in using either their registered **username** or **email address**.
- **Brute Force Protection**: Accounts are temporarily locked out for 10 minutes after 5 consecutive failed attempts.
- **Timing Attack Mitigation**: Employs constant-time checks and generic error messages (`"Invalid credentials"`) to prevent username/email enumeration.
- **Strict Data Isolation**: Submissions, preferences, activity calendars, and stats are bound to authenticated `user_id`s with server-side foreign-key constraints.

### 2. Static Code Analysis Engine
- **Python Analysis**:
  - AST parsing for reliable counts of functions, classes, loops, conditionals, and max nesting depth.
  - Cyclomatic complexity analysis via `Radon` with AST fallback.
  - Detection of dangerous patterns (e.g. bare `except:`, long functions > 40 lines, excessive parameters > 5, nesting > 4 levels).
- **C++ Analysis**:
  - Conservative token and brace analysis.
  - Detection of raw pointer hazards (`new`/`delete` without smart pointers).
  - Scope hygiene alerts for `using namespace std;`.
- **Transparent Quality Scoring**: Calculated deterministically on a 0–100 scale using documented deductions, rather than black-box guesses.

### 3. Developer Experience & UI
- **GitHub-Inspired Yearly Heatmap**: Interactive, green-scaled 52-week activity calendar generated using Plotly.
- **Longitudinal Trends ("My Progress")**: Multi-submission graphs tracking score and complexity improvements.
- **Evidence-Based Insights**: Highlights recurring code smells across historical submissions.
- **Full Account Management**: Dark/light theme toggling, accent color selection, code retention privacy options, submission history clearing, and cascading account deletion.

---

## Local Installation & Windows Instructions

### 1. Prerequisites
- Python 3.11, 3.12, or 3.13 installed.
- PowerShell or Command Prompt.

### 2. Setup Virtual Environment
Open PowerShell in the project directory:

```powershell
# Create virtual environment
py -m venv .venv

# Activate virtual environment
.\.venv\Scripts\Activate.ps1
```

*Note: If PowerShell scripts are restricted by execution policy, you can run directly using the environment's python:*
```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 3. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 4. Run Automated Test Suite
```powershell
python -m pytest tests -v
```

### 5. Launch Application Locally
```powershell
python -m streamlit run app.py
```
Open your browser to `http://localhost:8501`.

---

## Database Architecture

- **Local Mode (Default)**: If `DATABASE_URL` is not set, CodeMind AI automatically runs in local mode using `codemind.db` (SQLite). Foreign keys and cascading deletes are enabled.
- **Production Mode (Hosted)**: Set `DATABASE_URL` to a managed PostgreSQL connection string (such as Supabase, Neon, AWS RDS, or Render). CodeMind AI will automatically use PostgreSQL schema, indexes, and connection pooling.

---

## Public Deployment Guide (Streamlit Community Cloud + Managed PostgreSQL)

Follow these steps to deploy CodeMind AI to a public URL:

### Step 1: Provision a Free Hosted PostgreSQL Database
1. Go to [Supabase](https://supabase.com/) or [Neon.tech](https://neon.tech/) and create a free project.
2. Under project settings, copy the **Connection String (URI)**.
   *Example:* `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`

### Step 2: Push Repository to GitHub
1. Create a new repository on [GitHub](https://github.com/) named `CodeMind-AI`.
2. Initialize and push your project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of CodeMind AI"
   git branch -M main
   git remote add origin https://github.com/<your-username>/CodeMind-AI.git
   git push -u origin main
   ```

### Step 3: Deploy to Streamlit Community Cloud
1. Sign in to [share.streamlit.io](https://share.streamlit.io/) with your GitHub account.
2. Click **"New app"**.
3. Select your repository: `<your-username>/CodeMind-AI`, Branch: `main`, Main file path: `app.py`.
4. Click **"Advanced settings"**.
5. In the **Secrets** text box, paste your database configuration:
   ```toml
   DATABASE_URL = "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
   ```
6. Click **"Deploy!"**.
7. Streamlit Cloud will install dependencies from `requirements.txt`, run database schema migrations automatically on boot, and publish your site at `https://<your-app-name>.streamlit.app`.

---

## Security, Privacy, and Execution Policy

1. **No Unsafe Execution**: Arbitrary user-submitted code is **never executed directly on the host server**. Static analysis, AST inspection, and token evaluation are used exclusively, ensuring zero risk of remote code execution or server compromise.
2. **Code Retention Control**: Users can disable the "Retain raw source code" setting in **Settings** to keep only structural metrics and discard source code from the database.
3. **Data Erasure**: Users can permanently purge their submission records or delete their entire account with all cascading data.

---

## Machine Learning Integration Interface

The current version focuses on transparent, deterministic static analysis. For future machine learning enhancements (such as Defect Prediction using CodeXGLUE), the model pipeline can be plugged directly into `analyzer/__init__.py` by implementing:

```python
class MLDefectPredictor:
    def predict(self, code_snippet: str) -> dict:
        # Load pre-trained ONNX / PyTorch classifier
        # Return probability of defect and feature importances
        pass
```
The architecture is designed to load ML models optionally without breaking the core platform if model weights or GPUs are unavailable.
