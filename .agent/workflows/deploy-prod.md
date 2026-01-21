---
description: Build migrations (if needed), apply them to the production database, and deploy the application to Cloudflare.
---

1. Generate SQL migration files from the current schema (checks if schema needs updating).
// turbo
2. Run `bun run db:generate`

3. Apply any pending SQL migrations to the remote (production) D1 database.
// turbo
4. Run `bun run db:migrate:prod`

5. Build the application and deploy it to Cloudflare.
// turbo
6. Run `bun run deploy`
