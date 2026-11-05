# CodeMind AI

CodeMind AI is a web-first code analysis workspace. The existing Streamlit MVP remains at the repository root (`app.py`) with its Python AST and C++ heuristic analyzer and SQLite history. The new Next.js product lives in `src/` and uses PostgreSQL through Prisma.

## Current scope

- Responsive public pages, product information, draft privacy/terms, and SEO metadata.
- Auth.js email/password sign-in with bcrypt hashes; optional GitHub and Google OAuth.
- Protected dashboard, private report history, Monaco editor, and private project CRUD.
- Analysis API with a 100 KB request limit and no arbitrary code execution.
- Python AST and clearly labeled C++ lexical checks through the included FastAPI service. A limited, explicitly labeled lexical fallback is available if that service is not configured.
- Optional server-side AI endpoint; it is disabled until configured.
- Per-account rolling limits of 100 analyses and 20 AI requests per 24 hours.

The score is a heuristic: start at 100, subtract 15 per High, 7 per Medium, and 3 per Low finding, then clamp at zero. It is not an industry-standard metric and does not establish correctness or security.

## Requirements

- Node.js 20.9 or newer and npm.
- PostgreSQL 14 or newer (local or managed).
- Python 3.10+ only for the preserved analysis service / Streamlit MVP.

## Local web development

1. Copy `.env.example` to `.env.local`. Set `DATABASE_URL` and generate `AUTH_SECRET` with `openssl rand -base64 32` (or another secure random generator).
2. Install dependencies: `npm install`.
3. Create the database and apply the development migration: `npx prisma migrate dev --name init`.
4. (Recommended) Install `analysis_service/requirements.txt` in a Python environment and run `uvicorn analysis_service.main:app --host 127.0.0.1 --port 8000`. Keep the service private; set `ANALYSIS_SERVICE_URL=http://127.0.0.1:8000` in `.env.local`.
5. Start the web app: `npm run dev`; visit http://localhost:3000.
6. Create an account at `/register`. Sign in at `/login`.

Without step 4, the app labels and uses a limited lexical fallback. It does not have Python AST parsing or full C++ tooling in that mode.

## Legacy MVP

The original Streamlit app is still available: `run_codemind_ai.bat`, or `.venv/Scripts/python.exe -m streamlit run app.py`. Its history remains local SQLite data. The legacy project is preserved rather than deleted.

## Documentation

- [Environment variables](ENVIRONMENT_VARIABLES.md)
- [Deployment guide](DEPLOYMENT.md)
- [Security notes](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Checks

`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`, and `python -m unittest discover -s tests` are available. Database-backed and browser flows require a configured PostgreSQL database; browser tests need Playwright's Chromium installation.

## Known gaps before public production use

Email verification, password reset/change, transactional email, account deletion, persistent multi-provider AI conversations, PDF export, GitHub repository import/selection, user suspension controls, distributed rate limiting, and production-grade monitoring still need implementation/configuration. The legal pages are drafts. Do not present the current build as a complete hosted SaaS until these controls and deployment are reviewed.
