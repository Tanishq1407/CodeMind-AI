# Environment variables

Copy `.env.example` to `.env.local` for local development. Keep real values out of Git and client-side variables.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma for application traffic. For Neon, use the pooled URL (hostname contains `-pooler`). |
| `DATABASE_URL_UNPOOLED` | Yes for Prisma migrations | Direct, unpooled PostgreSQL URL. Prisma uses this for migrations; Neon CLI pulls it alongside `DATABASE_URL`. For local PostgreSQL or another provider, it can match `DATABASE_URL`. |
| `AUTH_SECRET` | Yes | Auth.js signing/encryption secret; generate a unique random secret per environment. |
| `AUTH_URL` | Yes in production | Canonical Auth.js URL (for example `https://codemindai.com`). |
| `NEXT_PUBLIC_APP_URL` | Yes in production | Public canonical origin for metadata and sitemap. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth. Both must be set; register callback `/api/auth/callback/google`. |
| `GITHUB_ID`, `GITHUB_SECRET` | Optional | GitHub identity sign-in. Callback `/api/auth/callback/github`. OAuth bearer/refresh tokens are deliberately not stored; repository import is not implemented. |
| `ANALYSIS_SERVICE_URL` | Recommended | Private FastAPI service origin. Do not expose this service publicly without authentication and network controls. |
| `ANALYSIS_SERVICE_TOKEN` | Required when the service URL is set | Shared random service credential. Set the same secret in the Next.js app and private FastAPI deployment. |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | Optional | Server-only assistant configuration. Set `AI_PROVIDER=openai-compatible` for an OpenAI-compatible chat completions endpoint. Never prefix secrets with `NEXT_PUBLIC_`. |
| `AI_BASE_URL` | Optional | Base URL for the configured compatible API; defaults to `https://api.openai.com/v1`. |
| `RESEND_API_KEY` | Required for account verification/recovery | Resend API key, kept server-side. |
| `EMAIL_FROM` | Required for account verification/recovery | Verified Resend sender. For this project use `CodeMind AI <noreply@codemindai.site>`. |
| `ADMIN_EMAIL` | Optional | Existing registered account to elevate when running the explicit seed command. Never stores or sets a password. |

Google/GitHub and AI credentials are optional. The email/password account flow requires Resend so it can verify addresses and deliver recovery links. The API fails closed if email delivery is not configured.

The Coding Assistant uses a real OpenAI-compatible chat completions API only when all three AI variables are configured. Without them, requests return a setup message and no assistant answer is fabricated. Requests may send the user-entered prompt, explicitly attached code or a selected saved report's source, plus a compact summary of that same user's recurring findings and score history. The summary does not include other users' data. The configured provider may charge per token; review its pricing and data-retention terms before enabling it. For production, set these values as server-only Vercel environment variables and redeploy after changes.

## Local registration setup

Registration requires all four server-side settings: `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, and `EMAIL_FROM`. If one is missing, the API returns a configuration error naming the missing variable(s) before it writes an account. Do not put these values in `NEXT_PUBLIC_*` variables or commit `.env.local`.

1. Start a local PostgreSQL 14+ instance and create an empty database named `codemind`.
2. In `.env.local`, set both `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to that database, for example `postgresql://postgres:<your-local-password>@localhost:5432/codemind?schema=public`. Replace the placeholder with your own local database password. For Neon, use the pooled URL for `DATABASE_URL` and direct URL for `DATABASE_URL_UNPOOLED`.
3. Generate a fresh `AUTH_SECRET` using `openssl rand -base64 32` (or an equivalent cryptographically secure random generator). It must be at least 32 characters; do not use the value from `.env.example`.
4. Set `RESEND_API_KEY` to your server-side Resend API key and `EMAIL_FROM` to a sender identity verified in your Resend account.
5. Run `npm run db:dev` to apply the checked-in development migrations, then `npm run dev`. The Prisma wrapper loads `.env.local` before invoking Prisma CLI commands.

If PostgreSQL is unreachable or migrations are missing, registration reports a database setup/connection error without returning Prisma details. If Resend rejects delivery after an account is saved, the response says the account is pending verification and points to the resend-verification flow. Registration never reports success until the verification email has been accepted for delivery.
