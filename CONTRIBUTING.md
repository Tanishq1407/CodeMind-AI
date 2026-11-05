# Contributing

## Development

Use Node.js 20.9+, PostgreSQL, and (for AST analysis) Python 3.10+. Follow the setup in `README.md`. Keep secrets in ignored environment files; never commit credentials or real user code.

## Product and analysis changes

- Keep static findings distinct from AI suggestions.
- Every analyzer method must state its scope and limitations. Never describe lexical checks as a compiler/static analyzer.
- Preserve the Streamlit MVP and its analysis logic unless a migration is explicitly planned.
- Scope every private read/write by the server-authenticated user ID.
- Add schema migrations for database changes and tests for changed behavior.
- Keep accessible labels, keyboard focus, responsive behavior, and reduced-motion support.

## Checks before a pull request

Run `npm run typecheck`, `npm run lint`, `npm test`, `python -m unittest discover -s tests`, and `npm run build`. Run `npm run test:e2e` when browser dependencies and PostgreSQL are available. Report failures and environmental constraints; do not omit failing results.

## Pull requests

Describe the user impact, security/data implications, migration steps, and checks run. Include screenshots for visible UI changes. Never include `.env*` files (except `.env.example`), secrets, database dumps, or submitted source samples.
