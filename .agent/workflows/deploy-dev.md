---
description: Generate schema migrations and apply them to the local development database.
---

1. Generate SQL migration files from the current schema.
// turbo
2. Run `bun run db:generate`

3. Apply any pending migrations to the local D1 database.
// turbo
4. Run `bun run db:migrate:dev`

5. Start the local development server.
// turbo
6. Run `bun run dev`
