---
description: Apply migrations to the production database and deploy the application to Cloudflare.
---

1. Apply pending SQL migrations to the remote (production) D1 database.
// turbo
2. Run `bun run db:migrate:prod`

3. Build the application and deploy it to Cloudflare.
// turbo
4. Run `bun run deploy`
