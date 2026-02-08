# Deploy to Production

Build migrations (if needed), apply them to the production database, and deploy the application to Cloudflare.

## Steps

1. Generate SQL migration files from the current schema (checks if schema needs updating):
   ```bash
   bun run db:generate
   ```

2. Apply any pending SQL migrations to the remote (production) D1 database:
   ```bash
   bun run db:migrate:prod
   ```

3. Build the application and deploy it to Cloudflare:
   ```bash
   bun run deploy
   ```

**Important:** Migrations must complete successfully before deploying new code that depends on schema changes.
