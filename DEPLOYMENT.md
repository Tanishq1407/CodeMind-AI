# Deployment

## Architecture and environments

- **Local:** Next.js on port 3000, PostgreSQL, and optionally FastAPI on loopback port 8000.
- **Preview:** use a separate database, Auth.js secret, OAuth callback registration, and AI key. Never point preview at production data.
- **Production target:** Next.js on Vercel; PostgreSQL on Supabase (or another managed PostgreSQL provider). Build the analysis service from `analysis_service/Dockerfile` on a private Python host/network path; Vercel functions cannot reach the local loopback service. Configure the same `ANALYSIS_SERVICE_TOKEN` on both services. If no private service URL is configured, the app uses the limited lexical fallback.

## Deploy checklist

1. Push the existing repository to its configured GitHub remote, preserving its history. Confirm the remote and branch are the intended deployment source before connecting Vercel.
2. Configure PostgreSQL. For Neon, set Vercel `DATABASE_URL` to the pooled URL and `DATABASE_URL_UNPOOLED` to the direct URL; Prisma uses the pooled URL for app queries and direct URL for migrations. Set both in the trusted migration environment as well.
3. Import the repository into Vercel. Configure all production environment variables from `ENVIRONMENT_VARIABLES.md`; set `AUTH_SECRET`, `AUTH_URL`, and `NEXT_PUBLIC_APP_URL` to the exact production origin.
4. Set OAuth callback URLs at each provider to `https://<domain>/api/auth/callback/google` and/or `/api/auth/callback/github`. Add preview callback URLs separately if required.
5. Apply production migrations with `npm run db:migrate` from a trusted release environment. Do not run development migrations against production.
6. Build with `npm run build`. Verify public routes, auth callbacks, private data isolation, and analysis behavior in preview before production traffic.
7. For initial admin access, register the intended account, set `ADMIN_EMAIL` in a trusted release environment, then run `npm run db:seed`. Remove/unset the variable after provisioning. The seed updates only the matching registered account.
8. Add a custom domain in Vercel and follow its DNS instructions at the registrar. Configure the domain's apex and `www` records exactly as shown by Vercel, select a canonical redirect, and wait for Vercel-managed TLS/HTTPS validation.

## codemindai.com

Domain registration availability has not been checked. Check availability with an accredited registrar before selecting it. If unavailable, consider `codemind.ai`, `usecodemind.com`, or `codemind.dev`, subject to registration availability and trademark review. Add the chosen domain in Vercel, set DNS records as instructed, and update `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, and OAuth callback URLs.

## Operational notes

- Configure email delivery and implement verification/password reset before inviting public users.
- Verify trusted proxy IP headers, add monitoring/alerting and backups, define a retention policy, and keep FastAPI on private networking before public launch.
- Vercel's production build runs `prisma generate && next build`; apply schema changes as a separate release migration.
- Never claim deployment is complete until the public URL and auth/database behavior have been verified.
