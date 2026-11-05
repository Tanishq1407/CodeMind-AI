# Environment variables

Copy `.env.example` to `.env.local` for local development. Keep real values out of Git and client-side variables.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma. Use a pooled URL for app traffic if the host provides one. |
| `AUTH_SECRET` | Yes | Auth.js signing/encryption secret; generate a unique random secret per environment. |
| `AUTH_URL` | Yes in production | Canonical Auth.js URL (for example `https://codemindai.com`). |
| `NEXT_PUBLIC_APP_URL` | Yes in production | Public canonical origin for metadata and sitemap. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth. Both must be set; register callback `/api/auth/callback/google`. |
| `GITHUB_ID`, `GITHUB_SECRET` | Optional | GitHub identity sign-in. Callback `/api/auth/callback/github`. OAuth bearer/refresh tokens are deliberately not stored; repository import is not implemented. |
| `ANALYSIS_SERVICE_URL` | Recommended | Private FastAPI service origin. Do not expose this service publicly without authentication and network controls. |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | Optional | Server-only assistant configuration. Set `AI_PROVIDER=openai-compatible` for an OpenAI-compatible chat completions endpoint. Never prefix secrets with `NEXT_PUBLIC_`. |
| `AI_BASE_URL` | Optional | Base URL for the configured compatible API; defaults to `https://api.openai.com/v1`. |
| `ADMIN_EMAIL` | Optional | Existing registered account to elevate when running the explicit seed command. Never stores or sets a password. |

OAuth and AI credentials are not required for local email/password and static analysis. Email delivery variables are not available because verification/reset mail is not implemented yet.
