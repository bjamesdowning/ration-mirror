# Quick Commit

Run the full pre-commit pipeline: lint, test, typecheck, generate and apply migrations, then commit and push changes.

## Steps

1. Ensure dependencies are up to date and the lockfile is synchronized:
   ```bash
   bun install
   ```

2. Run the linter to check for code style issues:
   ```bash
   bun run lint
   ```

3. Run the unit tests to ensure no regressions:
   ```bash
   bun run test:unit
   ```

4. Run type checking to verify TypeScript types:
   ```bash
   bun run typecheck
   ```

5. Generate SQL migration files from the current schema:
   ```bash
   bun run db:generate
   ```

6. Apply any pending SQL migrations to the remote (production) D1 database:
   ```bash
   bun run db:migrate:prod
   ```

7. Check the git status to see what files will be committed:
   ```bash
   git status
   ```

8. If all checks passed locally (and migrations are successful), add all changes to the staging area:
   ```bash
   git add .
   ```

9. Commit the changes with a descriptive commit message:
   ```bash
   git commit -m "YOUR_COMMIT_MESSAGE"
   ```

10. Push the changes to the remote repository:
    ```bash
    git push
    ```

**Note:** Only proceed with commit if all checks pass. The commit message should clearly describe what changed.
