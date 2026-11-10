# Security notes

## Implemented safeguards

- Passwords use bcrypt with cost factor 12. Raw passwords are not persisted.
- Auth.js sessions are signed; user identity is read server-side.
- Private project/report/database queries scope by the authenticated user ID.
- Registration and analysis payloads are validated; analysis input is limited to 100 KB and upload extensions are checked in the browser.
- Source code is treated as text and is never executed by the web or analysis service.
- Response headers include frame, MIME sniffing, and referrer protections.
- AI keys are read server-side only; errors returned to clients are generic for provider failures.

## Before production

- Set a strong unique `AUTH_SECRET`; configure secure production origins and OAuth callback URLs.
- Configure Resend for verification and password recovery, and run authenticated account flows through a production review.
- Rate limits use durable, HMAC-keyed PostgreSQL counters. Protect the database and verify ingress IP headers so client-supplied proxy headers cannot bypass IP buckets.
- Protect the analysis service behind private networking as well as its shared service token; do not publish it publicly.
- Review database TLS, pooled connections, backups, retention, access policies, logs, and incident response.
- GitHub OAuth is identity-only in this release; bearer and refresh tokens are not persisted. Repository import is not implemented; do not assume linked accounts can access repositories.
- Legal/privacy pages are drafts and need jurisdiction-specific review.

Report security issues privately to the maintainers once a security contact is configured. Do not put credentials or private source code in public issue trackers.
