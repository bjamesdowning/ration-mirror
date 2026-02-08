# Deploy to Development

Generate schema migrations and apply them to the local development database, then start the development server.

## Steps

1. Generate SQL migration files from the current schema:
   ```bash
   bun run db:generate
   ```

2. Apply any pending migrations to the local D1 database:
   ```bash
   bun run db:migrate:dev
   ```

3. Start the local development server:
   ```bash
   bun run dev
   ```
