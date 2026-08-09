# Quick Commit

Run the full pre-commit pipeline: lint, unit tests, typecheck, E2E tests (local env), iOS checks when relevant, generate and apply migrations, then commit and push changes.

Prefer `/long-commit` when the change still needs review, Flagship gating, or fix-ups. Use this only when the diff is already reviewed and ready to ship.

## Verify command hygiene (required — exit-code integrity)

Do **not** mask gate failures. Never run `bun run <gate> 2>&1 | tail` / `| head` without `set -o pipefail` or an explicit `status=$?; …; exit $status` after writing a log file.

Only claim a check passed when:

- Shell / tool `exit_code` is `0`
- Output does **not** contain `BUILD FAILED`, `** TEST FAILED **`, or `error: script`
- For `ios:check`: log includes `** TEST SUCCEEDED **`

If the log says failed but the wrapper exit is 0 (classic `| tail` without `pipefail`), treat as **failed** and stop.

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

5. Run E2E tests against the local environment (starts or reuses `dev:remote` server):
   ```bash
   bun run test:e2e
   ```
   **Prerequisites:** `wrangler login`, `bun run db:migrate:dev`, and dev secrets in `.dev.vars`.

6. If the diff touches `ios/`, `ios/project.yml`, mobile auth callback routes, mobile API contracts, or RevenueCat/iOS billing code, run the iOS build/test lane:
   ```bash
   bun run ios:check
   ```
   **Prerequisites:** full Xcode installed and selected (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`), XcodeGen installed (`brew install xcodegen`), and an iOS Simulator runtime installed. Override the simulator when needed:
   ```bash
   IOS_DESTINATION="platform=iOS Simulator,name=iPhone 17" bun run ios:check
   ```
   If `ios/` changed and this step is not run, call that out explicitly in the commit summary and do not claim the iOS build is verified. Web lint/unit/typecheck do not compile Swift — `ios:check` is the local compile gate before Apple Connect Archive.

7. Generate SQL migration files from the current schema:
   ```bash
   bun run db:generate
   ```

8. Apply any pending SQL migrations to the remote (production) D1 database:
   ```bash
   bun run db:migrate:prod
   ```

9. Check the git status to see what files will be committed:
   ```bash
   git status
   ```

10. If all checks passed locally (real exit codes + success markers) and migrations are successful, add all changes to the staging area:
   ```bash
   git add .
   ```

11. Commit the changes with a descriptive commit message:
   ```bash
   git commit -m "YOUR_COMMIT_MESSAGE"
   ```

12. Push the changes to the remote repository:
   ```bash
   git push
   ```

**Note:** Only proceed with commit if all checks pass. The commit message should clearly describe what changed.
