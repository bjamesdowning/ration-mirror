---
description: Quick protocol to lint, test, typecheck, build, conduct DB migrations, and commit changes
---

1. Ensure dependencies are up to date and the lockfile is synchronized.
// turbo
2. Run `bun install`

3. Run the linter to check for code style issues.
// turbo
4. Run `bun run lint`

5. Run the unit tests to ensure no regressions.
// turbo
6. Run `bun run test:unit`

7. Run type checking to verify TypeScript types.
// turbo
8. Run `bun run typecheck`

9. Generate SQL migration files from the current schema.
// turbo
10. Run `bun run db:generate`

11. Apply any pending SQL migrations to the remote (production) D1 database.
// turbo
12. Run `bun run db:migrate:prod`

13. Check the git status to see what files will be committed.
// turbo
14. Run `git status`

15. If all checks passed locally (and migrations are successful), add all changes to the staging area.
// turbo
16. Run `git add .`

17. Commit the changes. Please generate a descriptive commit message.
18. Run `git commit -m "MESSAGE"`

19. Push the changes to the remote repository.
// turbo
20. Run `git push`