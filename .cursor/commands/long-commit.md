# Long Commit

Full review → pattern/flag gate → plan → fix → verify → commit/push pipeline.

Use this instead of typing `/code-review` then “fix concerns/blockers/suggestions, remove dead code” then `/quick-commit`. Prefer `/quick-commit` only when the change is already reviewed and trivial.

**Hard gates:** Do not commit or push until every phase below passes. If blocked (secrets, ambiguous product decision, failing checks you cannot fix), stop and report — do not push a half-fixed branch.

### Verify command hygiene (required — exit-code integrity)

A past ship failed Apple Connect Archive after local `ios:check` had already failed, because the agent ran `bun run ios:check 2>&1 | tail -50` **without** `pipefail`. `tail` exited 0, the shell reported success, and the agent claimed the gate passed.

**Rules for every Phase 5 (and any mid-pipeline) verify command:**

1. **Never mask exit codes.** Do **not** run quality gates as `cmd 2>&1 | tail` / `| head` unless `set -o pipefail` is active in that shell **or** you capture status yourself.
2. **Preferred patterns** (pick one):
   ```bash
   # A — simplest: no pipe
   bun run ios:check

   # B — need a short chat snippet: log file, then show tail, then re-exit
   bun run ios:check > /tmp/ration-ios-check.log 2>&1
   status=$?
   tail -n 50 /tmp/ration-ios-check.log
   exit $status

   # C — stream + preserve failure
   set -o pipefail
   bun run ios:check 2>&1 | tee /tmp/ration-ios-check.log | tail -n 50
   ```
3. **Pass claims require evidence.** Only mark a gate ✓ when **all** are true:
   - Shell / tool `exit_code` is `0`
   - Output does **not** contain `BUILD FAILED`, `** TEST FAILED **`, `error: script`, or Vitest/Playwright failure summaries
   - For `ios:check`: output includes `** TEST SUCCEEDED **` (build+test lane)
4. If evidence is missing or contradictory (e.g. metadata `exit_code: 0` but log shows `BUILD FAILED`), treat as **failed**, stop commit/push, and fix.
5. After any further edits to files a gate covers (especially `ios/**/*.swift`), **re-run** that gate before commit — a earlier pass is stale.
6. Web tools (Biome / Vitest / `tsc`) do **not** compile Swift. iOS syntax/structure bugs only fail `ios:check` / Xcode Archive.

---

## Operating model (solo trunk + Flagship)

Ration ships **trunk-based** for the solo builder. There is **no MR gate** in this pipeline (MRs are reserved for dependency/review workflows later).

| Rule | Detail |
|------|--------|
| **Trunk** | Commit and push to the deploy branch (`main`). Workers Builds deploys that push to production. Treat every successful `/long-commit` as a production code ship. |
| **Local-first** | Prefer Miniflare/local D1/KV/R2 + Vitest + Playwright local prep. Use `dev:remote` / `env.dev` only when AI, Vectorize, live Flagship, email, or Stripe test webhooks cannot be simulated locally. |
| **No full staging env** | Do **not** invent per-MR Cloudflare previews or prod-bound preview DBs. Workers Preview URLs do not isolate bindings by default — unsafe for D1/billing. Dogfood via Flagship `userId` allowlist on production after push. |
| **Flagship = exposure control** | Unfinished or user-visible work ships **behind Flagship, default off**. Enable for your account only after push; then percent → 100%. Emergency kill: `FEATURE_FLAG_OVERRIDES`. |
| **Flags ≠ Worker gradual deploy** | Flagship toggles product paths inside one deployed version. Use Worker gradual/version-override only for risky runtime/infra changes — not as a substitute for feature flags. |

`main` must stay **deployable**. Incomplete features exist in code but are unreachable until Flagship turns them on.

---

## Phase 0 — Scope

1. Inspect the working tree (run in parallel):
   ```bash
   git status
   git diff
   git diff --staged
   git log -8 --oneline
   ```
2. If there are **no** local changes and nothing staged, stop. Do not create an empty commit.
3. Summarize the change set in 2–4 bullets (intent, surfaces touched: web / iOS / DB / API).

---

## Phase 0.5 — Pattern + Flagship gate (required)

Before review fixes, classify the change and decide whether Flagship is required. Record the decision in the Phase 1 review output and Phase 6 report.

### Pattern selection (pick one)

| Pattern | When | Implications for this commit |
|---------|------|------------------------------|
| **A — Safe hotfix / chore** | Pure tests, docs, lint, dead-code removal, typo, no user-visible behaviour change | No new flag. Proceed. |
| **B — Flag-gated feature / behaviour** | New or changed user-visible path, API surface, UI entry point, billing/AI flow, or WIP that must not hit all users on push | **Must** have Flagship gate (add if missing). Ship with dashboard flag **off**. |
| **C — Coordinated iOS + Workers** | Mobile API/auth/billing contract, schema the app depends on, or dual version bumps | Flag-gate the new contract when old clients must keep working; include Release checklist in Phase 6 (web + iOS versions, TestFlight note, rollback = disable flag). |
| **D — Infra / runtime only** | Wrangler, migrations-only with no product UX, Workers Builds config | Usually no Flagship. Prefer local migrate dry-run; `db:migrate:prod` only when schema is ready. Consider Worker gradual deploy only for high-risk runtime — do not block this command on it. |

Default when unsure between A and B: **B** (gate it).

### Does this change need a feature flag?

**Require Flagship when any of these are true:**

- New user-visible feature, screen, CTA, or settings path
- Behaviour change users would notice (including signed-out / marketing surfaces)
- New or breaking-ish API used by web or iOS
- AI / billing / auth flows that should be kill-switched without redeploy
- Incomplete work that would otherwise be live the moment `main` deploys

**Skip Flagship when all of these are true:**

- No user-visible behaviour change
- Pure refactor with identical external behaviour, or test/docs/chore only
- Fix that must apply to everyone immediately (security patch) — still prefer a flag if the fix is risky and can fail closed safely; ask if ambiguous

### If a flag is required and missing

Treat missing gate as a **Blocker**. In Phase 3, follow the **`/add-feature-flag`** command (and [`docs/dev/feature-flags.md`](../../docs/dev/feature-flags.md)) end-to-end:

1. Add `FLAG_REGISTRY` entry with `defaultEnabled: false`
2. Server-side `isFeatureEnabled` / `assertFeatureEnabled` at the lowest enforcement point (UI-only gating is insufficient)
3. `clientVisible` + `clientFlags` if web/iOS UI must hide entry points
4. Unit tests for **on and off** paths (`env.FLAGS.getBooleanValue` mocks)
5. Reminder for the operator: create the matching Flagship dashboard flag (**disabled**) in app `ration` before enabling for anyone
6. Run `bun run flag:check` in Phase 5

Do **not** enable the dashboard flag as part of this command. Post-push dogfood is manual: enable for **your `userId` only**, then widen.

### Local vs remote verification bias

- Prefer **local** (`bun run test:unit`, local D1 via project scripts, `test:e2e` prep) for everything that can run without Cloudflare network resources.
- Use **`dev:remote` / `env.dev`** only when the change cannot be proven locally (AI, Vectorize, live Flagship evaluation, email, Stripe test webhooks).
- Never point exploratory testing at production D1/R2 as a substitute for a flag.

---

## Phase 1 — Full code review

Review **all** uncommitted changes (and related call sites the diff implies) against Ration standards. Walk the checklist; do not rubber-stamp.

### 1. Build & Type Safety
- [ ] No `console.log` in production code
- [ ] No unused variables or imports
- [ ] Changes look lint/typecheck/test ready (actual runs are Phase 5)
- [ ] If `ios/` or mobile API contracts changed, note that `ios:check` is required later
- [ ] Edited Swift: brace/structure sanity (extra `}` closing `body` early is a common agent edit bug; Archive will fail even if web gates pass)

### 2. Cloudflare Workers Compatibility
- [ ] No Node.js APIs (`fs`, `net`, `child_process`)
- [ ] Env via `context.cloudflare.env` / Worker `env` — never `process.env` for secrets/bindings

### 3. React Router Patterns
- [ ] No `useEffect` for data fetching (loaders)
- [ ] Mutations use `useFetcher` + optimistic UI where appropriate
- [ ] Routes match existing `app/routes/` patterns

### 4. Security
- [ ] Zod validation at API boundary
- [ ] `requireAuth` / `requireActiveGroup` where needed
- [ ] Queries scoped by session `user_id` / group — never client-supplied identity
- [ ] No secrets in code; iOS `Info.plist` public keys only
- [ ] Rate limiting considered for expensive / AI / billing endpoints

### 5. Database
- [ ] Schema edits originate in `app/db/schema.ts` (never hand-written migrations)
- [ ] Multi-statement writes use `db.batch()`; bulk inserts respect D1 100-param limits
- [ ] Vectorize sync considered if inventory embeddings change

### 6. Feature flags (Flagship)
- [ ] Phase 0.5 pattern recorded (A/B/C/D)
- [ ] If pattern B or C (or gate required): flag key in registry, server enforcement, off-path safe, tests for on/off
- [ ] No secrets or unnecessary PII in flag evaluation context
- [ ] Commit will ship with flag **off** in Flagship (dogfood after push via `userId` allowlist)

### 7. Code Quality
- [ ] Small, single-responsibility modules; prefer FP composition
- [ ] Strict types; `handleApiError` in route catch blocks
- [ ] Meaningful unit/schema tests for new pure logic / Zod / bug fixes
- [ ] README updated if commands, architecture, or user-facing behaviour changed
- [ ] Version bump required before commit (see Phase 4)

### 8. Design & UX (if UI touched)
- [ ] Orbital Luxury tokens; mobile-first; thumb-zone primary actions
- [ ] iOS screens use `ios/Ration/Core/Design/` tokens/components

### Review output (required before planning)

Classify every finding:

| Severity | Meaning | Action in Phase 3 |
|----------|---------|-------------------|
| **Blocker** | Correctness, security, data loss, Workers break, missing auth/RLS, secret leak, **missing required Flagship gate** | Must fix |
| **Concern** | Likely bug, missing tests, DoD gap, fragile pattern, flag UI-only without server gate | Must fix |
| **Suggestion** | Clear improvement tied to this change | Fix if low-risk and in-scope; otherwise note as follow-up |
| **Dead code** | Unused imports, obsolete helpers, commented-out leftovers **from this change** | Must remove |

Also note:

- **Pattern:** `A` | `B` | `C` | `D`
- **Flagship:** `not required` | `present: <key>` | `will add: <key>`
- **Approval status:** `Blocked` | `Fixable` | `Clean`

---

## Phase 2 — Fix plan

Before editing, publish a short plan:

1. **Goal** — one sentence
2. **Pattern + Flagship** — chosen pattern; flag key or “none”
3. **Fixes** — ordered checklist mapped to findings (blocker → concern → suggestion → dead code). Include `/add-feature-flag` steps when adding a gate.
4. **Out of scope** — suggestions deferred (with why); MR workflow; full staging environments
5. **Risk** — migrations, iOS, auth, billing, Flagship, or prod D1 migrate
6. **Verify** — which checks will prove each fix (include `flag:check` when flags touched)

Do **not** expand scope into unrelated refactors. Prefer the smallest fix that resolves the finding.

---

## Phase 3 — Execute fixes

1. Implement the plan in dependency order (types/schema → **Flagship registry/gates** → lib → routes → UI → tests → docs).
2. When adding a flag, follow `/add-feature-flag` fully (registry, server gate, client visibility if needed, on/off tests).
3. Remove dead code **associated with this change** only — do not delete unrelated unused code discovered incidentally unless it is clearly introduced by the diff.
4. Keep changes focused; match existing style; no drive-by renames.
5. After edits, re-scan the diff for new issues introduced by the fixes (especially ungated entry points).

If a finding requires a product/security decision you cannot infer, **stop** and ask — do not guess on auth, billing, or data deletion behaviour.

---

## Phase 4 — Definition of Done (pre-pipeline)

Confirm before running the commit pipeline:

- [ ] All **Blockers** and **Concerns** resolved
- [ ] In-scope **Suggestions** applied or explicitly deferred in the final summary
- [ ] Dead code from the change removed
- [ ] Flagship decision satisfied (`not required` or gate + tests + `defaultEnabled: false`)
- [ ] Version bumped per project rules:
  - Web: `package.json` + `app/lib/version.ts` (`APP_VERSION` / MCP / Copilot constants)
  - Patch `1.X.1`…`1.X.49`, then minor `1.(X+1).0`
  - If `ios/` ships: bump `MARKETING_VERSION` in `ios/project.yml` (and `CURRENT_PROJECT_VERSION` when uploading); run `bun run ios:generate` after `project.yml` edits
- [ ] README checked/updated if required
- [ ] New/changed pure logic or schemas have tests where the project rules require them

Re-state approval: must be **Ready for commit pipeline** (equivalent to Clean after fixes).

---

## Phase 5 — Local verify → commit → push

This is the **local quality gate**. GitLab CI verify jobs may be disabled to conserve minutes; do not assume remote CI will catch failures. **Only proceed to commit/push if every required step succeeds.**

Obey **Verify command hygiene** above for every command in this phase. Record each gate’s real exit code before claiming pass.

1. Sync dependencies:
   ```bash
   bun install
   ```

2. Lint:
   ```bash
   bun run lint
   ```

3. Unit tests:
   ```bash
   bun run test:unit
   ```

4. Typecheck:
   ```bash
   bun run typecheck
   ```

5. Flag registry (required when Flagship files, gates, or `/add-feature-flag` work ran; recommended always — cheap):
   ```bash
   bun run flag:check
   ```

6. E2E (local-first; starts or reuses project e2e prep — prefer local bindings; `dev:remote` only if the suite needs it):
   ```bash
   bun run test:e2e
   ```
   **Prerequisites:** `wrangler login` when remote bindings are used, migrations applied for the target DB, secrets in `.dev.vars` as required by the suite.

7. If the diff touches `ios/`, `ios/project.yml`, mobile auth callbacks, mobile API contracts, or RevenueCat/iOS billing:
   ```bash
   bun run ios:check
   ```
   Require `exit_code == 0` **and** `** TEST SUCCEEDED **` in the log. If iOS changed and this step is skipped, say so explicitly and do **not** claim iOS is verified. Do **not** treat Apple Connect / Xcode Cloud as the first compile gate.

8. Generate migrations from schema (Drizzle only — never hand-write SQL):
   ```bash
   bun run db:generate
   ```

9. Apply pending migrations to production D1 (only when this change introduces or requires schema that production must have before/at deploy):
   ```bash
   bun run db:migrate:prod
   ```
   Prefer proving migrations locally / against `ration-db-dev` first when the change is migration-heavy.

10. Inspect what will be committed:
    ```bash
    git status
    git diff
    git diff --staged
    ```
    Refuse to commit secrets (`.env`, `.dev.vars`, credentials, private keys).

11. Stage relevant changes:
    ```bash
    git add .
    ```
    (Exclude secret files if present; warn the user.)

12. Commit with a conventional message including the version tag(s), e.g. `[v1.6.29]` and `[ios-v1.1.1]` when iOS ships. If a new flag was added, name the key and note dashboard flag stays **off**. Use a HEREDOC:
    ```bash
    git commit -m "$(cat <<'EOF'
    type: short why-focused summary

    [vX.Y.Z]
    EOF
    )"
    ```

13. Push (triggers Workers Builds production deploy):
    ```bash
    git push
    ```

If any check fails: fix, re-run the failed step (and dependents), then continue. Do **not** use `--no-verify` or skip hooks. Do **not** commit/push while a required gate’s exit code is non-zero or its success marker is missing.

### After push (operator, not automated)

1. Confirm Workers Builds succeeded (known gap: silent rollback possible — check dashboard if behaviour is missing).
2. If Flagship was used: leave flag **off** for everyone; enable **your `userId` only**; smoke web (± TestFlight for pattern C).
3. Widen rollout only after dogfood; remove flag code later when stable.

---

## Phase 6 — Final report

After a successful push (or a hard stop), report:

1. **Pattern + Flagship** — A/B/C/D; flag key or none; dashboard still off
2. **Review** — blockers / concerns / suggestions / dead code
3. **Fixes** — what changed in Phase 3 (include flag additions)
4. **Deferred** — follow-ups (MR workflow, staging Worker, etc.)
5. **Pipeline** — each gate with **exit code** and pass/fail (lint / unit / typecheck / flag:check / e2e / ios / migrate). Never list a gate as ✓ without exit `0` + success marker when applicable.
6. **Git** — commit hash, message, remote status (or why commit/push did not run)
7. **Dogfood** — one-line next step (e.g. “Enable `my-flag` for your userId in Flagship”)

For **pattern C**, also list: web version, iOS marketing/build versions, contract note, rollback = disable flag / previous build.

---

## Notes

- This command **implies** commit + push authority (same as `/quick-commit`). Pushing `main` **is** the production deploy trigger via Workers Builds.
- For review-only, use `/code-review`.
- For already-clean diffs with no flag decision needed, use `/quick-commit`.
- Adding gates: use `/add-feature-flag` (invoked from Phase 3 when Phase 0.5 requires a flag).
- Prefer Bugbot / Security Review subagents only when the user (or this command’s findings) warrant an extra pass on large or auth/billing diffs — do not block the pipeline waiting on optional subagents unless a Blocker requires it.
- Do not propose full per-MR Cloudflare test environments or MR-based release ceremony from this command unless the user explicitly asks.
- **Exit-code integrity** applies to all verify shells in this command; `| tail` without `pipefail` is a known false-pass hazard.
