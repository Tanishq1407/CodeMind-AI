# Deployment

## Architecture and environments

- **Local:** Next.js on port 3000, PostgreSQL, and optionally FastAPI on loopback port 8000.
- **Preview:** use a separate database, Auth.js secret, OAuth callback registration, and AI key. Never point preview at production data.
- **Production target:** Next.js on Vercel; PostgreSQL on Neon; authenticated Python analysis service on Render. Vercel calls the Render HTTPS web-service URL server-side with a shared token. In production the app fails with a configuration error if the service URL or token is missing; the limited lexical fallback is development-only.

## Deploy checklist

1. Push the existing repository to its configured GitHub remote, preserving its history. Confirm the remote and branch are the intended deployment source before connecting Vercel.
2. Configure PostgreSQL. For Neon, set Vercel `DATABASE_URL` to the pooled URL and `DATABASE_URL_UNPOOLED` to the direct URL; Prisma uses the pooled URL for app queries and direct URL for migrations. Set both in the trusted migration environment as well.
3. Import the repository into Vercel. Configure all production environment variables from `ENVIRONMENT_VARIABLES.md`; set `AUTH_SECRET`, `AUTH_URL`, and `NEXT_PUBLIC_APP_URL` to the exact production origin.
4. Set OAuth callback URLs at each provider to `https://<domain>/api/auth/callback/google` and/or `/api/auth/callback/github`. Add preview callback URLs separately if required.
5. Apply production migrations with `npm run db:migrate` from a trusted release environment. Do not run development migrations against production.
6. Build with `npm run build`. Verify public routes, auth callbacks, private data isolation, and analysis behavior in preview before production traffic.
7. For initial admin access, register the intended account, set `ADMIN_EMAIL` in a trusted release environment, then run `npm run db:seed`. Remove/unset the variable after provisioning. The seed updates only the matching registered account.
8. Add a custom domain in Vercel and follow its DNS instructions at the registrar. Configure the domain's apex and `www` records exactly as shown by Vercel, select a canonical redirect, and wait for Vercel-managed TLS/HTTPS validation.

## Render Python analysis service

The repository includes a Render Blueprint at [`render.yaml`](render.yaml). It deploys the FastAPI service from the repository root so `analysis_service.main` can import the existing `analysis` package. The Blueprint sets Python 3.14.10, installs `analysis_service/requirements.txt`, starts one Uvicorn worker bound to Render's injected `$PORT`, checks `/health`, and generates `ANALYSIS_SERVICE_TOKEN` as a secret. Render's FastAPI guidance uses a `0.0.0.0` bind and the injected port; its Blueprint supports the root directory, health path, and generated secrets ([FastAPI deployment](https://render.com/docs/deploy-fastapi), [Blueprint reference](https://render.com/docs/blueprint-spec), [health checks](https://render.com/docs/health-checks), [Python version](https://render.com/docs/python-version)).

Deploy steps:

1. Push this repository branch to GitHub when you are ready to deploy. In Render, choose **New → Blueprint** and select this repository. Review the proposed service `codemind-ai-python-analysis`; do not change its root directory from `.`.
2. Confirm the service build command is `pip install -r analysis_service/requirements.txt`, the start command is `uvicorn analysis_service.main:app --host 0.0.0.0 --port $PORT --workers 1`, and the health-check path is `/health`.
3. Let Render generate `ANALYSIS_SERVICE_TOKEN`. Do not put its value in the repository, logs, or chat. Wait for the deploy and health check to pass. Render will then assign the service an HTTPS URL such as a provider-generated `*.onrender.com` address; **that URL is not known before deployment**.
4. Test `https://<actual-render-service-url>/health`; it should return `{"status":"ok"}`. `/analyze` remains protected by the shared token.
5. In Vercel, open the CodeMind project’s **Settings → Environment Variables** and add these as server-only Production variables:

   - `ANALYSIS_SERVICE_URL` = the actual Render HTTPS origin from step 3, with no `/analyze` suffix.
   - `ANALYSIS_SERVICE_TOKEN` = the generated secret copied from Render.

   Add them to Preview too only if Preview should use a separate analysis service and matching token. Never name either variable `NEXT_PUBLIC_*`.

6. Redeploy Vercel so its server functions load the new variables. Then sign in to `codemindai.site`, analyze Python code with an unused assignment, and confirm the report says `AST` and shows the exact line. A missing/mismatched token, timeout, invalid response, and report-storage failure now have distinct safe messages and stage-only server logs.

For local service tests, install with `python -m pip install -r analysis_service/test-requirements.txt` in a Python virtual environment and run `python -m unittest discover -s analysis_service -p 'test_*.py'`. This includes the `/health`, token, validation, byte-limit, analyzer-output, and safe-failure tests.

The service web endpoint is reachable over HTTPS so Vercel can call it; `/analyze` requires the high-entropy shared header token. Keep the token only in Render/Vercel secret settings. If the URL changes after recreating the Render service, update `ANALYSIS_SERVICE_URL` and redeploy Vercel. Render Free services spin down after 15 idle minutes and may take about a minute to start again ([Render Free limitations](https://render.com/docs/free)); that exceeds this API's 12-second upstream timeout, so use a non-spinning Render plan if Python analysis must be available without cold-start failures. Vercel's analysis route has a 30-second maximum duration; confirm this is within the selected Vercel plan's configured limit ([Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)).

## Neon production migrations

Keep `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) scoped to the Neon production branch. Configure both as Vercel Production environment variables and in the trusted migration environment. The repository's `prisma/migrations` files are the source of truth; never use `prisma db push` or `npm run db:dev` against production.

For a trusted release environment with the Neon CLI authenticated and the production branch linked:

```powershell
neon status
neon env pull --file .env.local --service postgres
npm run db:validate
node scripts/prisma-with-env.mjs migrate status
npm run db:migrate
node scripts/prisma-with-env.mjs migrate status
```

The auth uniqueness migration first checks for case-insensitive email or username collisions and aborts without modifying users if any exist. Resolve such conflicts through an explicit account-owner decision before retrying; never delete accounts as an automatic migration step.

Review the migration status before applying. `npm run db:migrate` runs Prisma `migrate deploy`, which applies only checked-in migrations and does not generate a development migration. Then redeploy the Vercel production app so it uses the configured variables. Do not print or commit `.env.local`.

## codemindai.com

Domain registration availability has not been checked. Check availability with an accredited registrar before selecting it. If unavailable, consider `codemind.ai`, `usecodemind.com`, or `codemind.dev`, subject to registration availability and trademark review. Add the chosen domain in Vercel, set DNS records as instructed, and update `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, and OAuth callback URLs.

## Operational notes

- Configure email delivery and implement verification/password reset before inviting public users.
- Verify trusted proxy IP headers, add monitoring/alerting and backups, define a retention policy, and keep FastAPI on private networking before public launch.
- Vercel's production build runs `prisma generate && next build`; apply schema changes as a separate release migration.
- Never claim deployment is complete until the public URL and auth/database behavior have been verified.
