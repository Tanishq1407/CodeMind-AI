# CodeMind AI

CodeMind AI is a web-first code analysis workspace. The existing Streamlit MVP remains at the repository root (`app.py`) with its Python AST and C++ heuristic analyzer and SQLite history. The new Next.js product lives in `src/` and uses PostgreSQL through Prisma.

## Current scope

- Responsive public pages, product information, draft privacy/terms, and SEO metadata.
- Auth.js email/password sign-in with bcrypt hashes; optional GitHub and Google OAuth.
- Protected dashboard, private report history, Monaco editor, and private project CRUD.
- Analysis API with a 100 KB request limit and no arbitrary code execution.
- Python AST and clearly labeled C++ lexical checks through the included FastAPI service. A limited, explicitly labeled lexical fallback is available if that service is not configured.
- JavaScript AST parsing through Acorn and Java grammar parsing through `java-parser`; rule coverage is intentionally narrower than full project linters.
- Email verification, password reset, password change, account deletion, profile editing, and persistent HMAC-keyed database rate limits (requires Resend email configuration).
- Per-account rolling limits of 100 analyses and 20 AI requests per 24 hours.
- Optional server-side AI endpoint; it is disabled until configured.
- Persistent analysis history, score comparison, search/filtering, JSON/PDF downloads, and report deletion.
- Saved AI conversations, per-account quotas, and an administrator dashboard with account status and audit events.

The score is a heuristic: start at 100, subtract 15 per High, 7 per Medium, and 3 per Low finding, then clamp at zero. It is not an industry-standard metric and does not establish correctness or security.

## Requirements

- Node.js 20.9 or newer and npm.
- PostgreSQL 14 or newer (local or managed).
- Python 3.10+ only for the preserved analysis service / Streamlit MVP.
- Resend account/API key and verified sender for email verification and recovery.

## Local web development

1. If `.env.local` does not already exist, copy `.env.example` to `.env.local`; do not overwrite an existing local environment file. Set `DATABASE_URL` to a PostgreSQL database you control, generate `AUTH_SECRET` with `openssl rand -base64 32`, and configure `RESEND_API_KEY` plus a verified `EMAIL_FROM` sender. See [local registration setup](ENVIRONMENT_VARIABLES.md#local-registration-setup).
2. Install dependencies: `npm install`.
3. Generate the Prisma client and apply the development migration: `npx prisma generate`, then `npm run db:dev`. Set both `DATABASE_URL` and `DATABASE_URL_UNPOOLED`; for Neon, use its pooled and direct URLs respectively. Re-run `npx prisma generate` after changing `prisma/schema.prisma` before starting the app; a stale generated client can prevent API routes from compiling.
4. (Recommended) Install `analysis_service/requirements.txt`, set the same random `ANALYSIS_SERVICE_TOKEN` in the web app and service environment, and run `uvicorn analysis_service.main:app --host 127.0.0.1 --port 8000`. Keep the service private; set `ANALYSIS_SERVICE_URL=http://127.0.0.1:8000` in `.env.local`.
5. Start the web app: `npm run dev`; visit http://localhost:3000.
6. Create an account at `/register`, then verify the email before signing in at `/login`.

## Production database migration

For Neon production, configure Vercel's Production environment with the branch's pooled `DATABASE_URL` and direct `DATABASE_URL_UNPOOLED`. In a trusted release environment, review `node scripts/prisma-with-env.mjs migrate status`, then apply checked-in migrations with `npm run db:migrate` and verify status again. See [Neon production migrations](DEPLOYMENT.md#neon-production-migrations). Never run `npm run db:dev` against production.

Set `RESEND_API_KEY` and `EMAIL_FROM=CodeMind AI <noreply@codemindai.site>` in the Vercel Production environment for verification email delivery.

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

GitHub repository import/selection is not implemented; GitHub is identity-only. Email delivery, OAuth, AI, PostgreSQL, and the private analysis service need external configuration. The Java and JavaScript rules are intentionally narrower than full project linters, and C++ checks are limited. The legal pages are drafts. Production monitoring, backups, retention policy, and deployment review remain operational work; this repository is not publicly deployed.
