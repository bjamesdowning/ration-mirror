---
description: Quick protocol to lint, test, typecheck, build, and commit changes
---

1. Run the linter to check for code style issues.
// turbo
2. Run `bun run lint`

3. Run the unit tests to ensure no regressions.
// turbo
4. Run `bun run test:unit`

5. Run type checking to verify TypeScript types.
// turbo
6. Run `bun run typecheck`

7. Check the git status to see what files will be committed.
// turbo
8. Run `git status`

9. If all checks passed locally, add all changes to the staging area.
// turbo
10. Run `git add .`

11. Commit the changes. Please generate a descriptive commit message.
12. Run `git commit -m "MESSAGE"`

13. Push the changes to the remote repository.
// turbo
14. Run `git push`