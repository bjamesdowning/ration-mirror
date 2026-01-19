---
description: Quick protocol to lint, test, typecheck, build, and commit changes
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

9. Check the git status to see what files will be committed.
// turbo
10. Run `git status`

11. If all checks passed locally, add all changes to the staging area.
// turbo
12. Run `git add .`

13. Commit the changes. Please generate a descriptive commit message.
14. Run `git commit -m "MESSAGE"`

15. Push the changes to the remote repository.
// turbo
16. Run `git push`