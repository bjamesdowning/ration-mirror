# Ration iOS (Stream C + Post-MVP Polish)

Native SwiftUI client for Ration, talking to the `/api/mobile/v1/*` Bearer-token API.
Entitlements are owned by RevenueCat; the app reads `user.tier`/credits from the
server and purchases via the RevenueCat SDK.

## Requirements

- Xcode 15+ (iOS 17 deployment target)
- [XcodeGen](https://github.com/yonyz/XcodeGen) to generate the `.xcodeproj` from `project.yml`:
  ```bash
  brew install xcodegen
  ```

## Generate & run

```bash
cd ios
xcodegen generate      # writes Ration.xcodeproj from project.yml
open Ration.xcodeproj
```

Set your **Apple Developer Team ID** in `project.yml` (`DEVELOPMENT_TEAM`) before
building to a device, then re-run `xcodegen generate`.

**Versioning:** User-facing app version is `MARKETING_VERSION` in `project.yml`
(currently **1.1.23**). `CURRENT_PROJECT_VERSION` is the monotonic build number for
TestFlight / App Store uploads. Follow the same patch/minor rules as the web app
(`1.X.1`–`1.X.49`, then `1.(X+1).0`); see `.cursor/rules/ration-master.mdc`.
After editing `project.yml`, run `bun run ios:generate`.

### First-class repo commands

Run these from the repository root:

```bash
bun run ios:generate  # regenerate Ration.xcodeproj after Swift file/project.yml changes
bun run ios:build     # xcodebuild app build
bun run ios:test      # XCTest target
bun run ios:check     # generate + build + test
```

Builds use `generic/platform=iOS Simulator` for portability. XCTest cannot run on
that abstract destination, so `ios:test`/`ios:check` auto-resolve a concrete
simulator — the first **Booted** iPhone if one is running, otherwise the first
available iPhone. To pin a specific simulator (used for both build and test):

```bash
IOS_DESTINATION="platform=iOS Simulator,name=iPhone 17" bun run ios:check
```

If Xcode reports `Cannot find 'SomeView' in scope` after adding a Swift file,
the generated project is stale. Run `bun run ios:generate`, then build again
with **⌘R** in Xcode.

### Archive & TestFlight signing

Simulator builds (`bun run ios:build`) skip code signing. **Archive** requires
Apple Developer signing on a physical device or **Any iOS Device (arm64)**.

**One-time setup (do these before Product → Archive):**

1. **Register the App ID** at [developer.apple.com](https://developer.apple.com/account) →
   Certificates, Identifiers & Profiles → Identifiers → `com.mayutic.ration` with
   **Sign in with Apple** and **Associated Domains**.
2. **Register a device (optional for TestFlight, but fixes automatic signing errors)** —
   Xcode's automatic signing often fails with *"Your team has no devices…"* until at
   least one device is on the account. **TestFlight itself does not require this** once
   you have a valid App Store distribution profile, but registering one device unblocks
   automatic signing.

   **Without a working USB port**, register the UDID wirelessly:
   - On the iPhone, open Safari → [Apple's register-device flow](https://developer.apple.com/account/resources/devices/list) or a trusted UDID checker (e.g. install a temporary config profile, then remove it after).
   - Copy the 40-character UDID.
   - [developer.apple.com](https://developer.apple.com/account) → **Devices** → **+** → enter name + UDID.

   **Alternative (no device registration at all):** use **manual signing** with an App
   Store distribution profile (step 3b below). Apple confirms distribution profiles do
   not include a device list.
3. **Create an Apple Distribution certificate** — Xcode → **Settings → Accounts**
   → select your Apple ID → **Manage Certificates…** → **+** → **Apple
   Distribution**. Archive uploads need this; an **Apple Development** cert alone
   is not enough.

   **3b. Manual App Store profile (recommended if USB is unavailable):**
   - [developer.apple.com](https://developer.apple.com/account) → **Profiles** → **+**
   - Type: **App Store Connect** (or **App Store**)
   - App ID: `com.mayutic.ration` → select your **Apple Distribution** certificate → name it → **Download**
   - Double-click the `.mobileprovision` file to install it
   - In Xcode: **Ration** target → **Signing & Capabilities** → **uncheck** Automatically manage signing → under **Release**, set **Provisioning Profile** to the profile you downloaded

4. **Enable automatic signing (skip if using manual signing above)** — select the **Ration** target → **Signing & Capabilities** → check **Automatically manage signing**, team `M2KJH5GDGH`. After `bun run ios:generate`, `project.yml` sets `CODE_SIGN_STYLE: Automatic`.
5. **Create the App Store Connect app** (if not done) with bundle ID
   `com.mayutic.ration`.

**Archive steps:**

1. Destination: **Any iOS Device (arm64)** — not a simulator.
2. **Product → Archive**.
3. **Distribute App → App Store Connect → Upload**.

**Common errors:**

| Error | Fix |
| ----- | --- |
| *Your team has no devices…* | Register device UDID wirelessly (Safari on iPhone → developer portal → Devices), **or** switch to manual App Store distribution profile (see step 3b). |
| *No profiles for 'com.mayutic.ration'* | Confirm App ID exists; enable automatic signing; retry after Distribution cert exists. |
| *Communication with Apple failed* | Sign out/in under Settings → Accounts; confirm paid Developer Program membership is active. |

### Xcode Cloud (GitLab → TestFlight)

Pushes to `main` on GitLab trigger **Xcode Cloud** (Apple CI), not `.gitlab-ci.yml`.
The GitLab repo is connected under **App Store Connect → Ration by Mayutic → Xcode Cloud → Settings → Repositories** (`mayutic/ration/application`).

`Ration.xcodeproj` is **not** committed — it is generated from `project.yml` via XcodeGen.
Xcode Cloud runs [`ci_scripts/ci_post_clone.sh`](ci_scripts/ci_post_clone.sh) after clone to install XcodeGen, generate the project, and copy the pinned [`swiftpm/Package.resolved`](swiftpm/Package.resolved) into the generated workspace (Xcode Cloud does not auto-resolve SPM).

When SPM dependencies in `project.yml` change, resolve locally (`xcodebuild -resolvePackageDependencies -project ios/Ration.xcodeproj -scheme Ration`) and commit the updated `ios/swiftpm/Package.resolved`.

**Workflow (configure in App Store Connect → Xcode Cloud → Manage Workflows):**

| Setting | Value |
| ------- | ----- |
| Start condition | Branch Changes → `main` |
| Project | `ios/Ration.xcodeproj` |
| Scheme | `Ration` |
| Action | Archive - iOS |
| Post-action | **TestFlight Internal Testing** |

Every TestFlight / App Store upload needs a new `CURRENT_PROJECT_VERSION` in `project.yml`.
Archive alone uploads to App Store Connect; the TestFlight post-action distributes to internal testers.

**Local sanity check** (simulates the Xcode Cloud post-clone step):

```bash
rm -rf ios/Ration.xcodeproj
(cd ios/ci_scripts && ./ci_post_clone.sh)
test -d ios/Ration.xcodeproj
```

**Production:** TestFlight auto-uploads from `main` do not publish to the public App Store.
When live, submit a tested build manually under **Distribution → + Version → Submit for Review**.

**Export archive exit code 70** (archive succeeds, export/signing fails):

This is an Apple **managed signing** issue in Xcode Cloud, not a compile error. In the detailed export log, look for `No signing certificate "iOS Distribution" found` or similar.

1. [developer.apple.com → Certificates](https://developer.apple.com/account/resources/certificates/list) — revoke **Distribution Managed (Xcode Cloud)** and **Development Managed (Xcode Cloud)** (revoked certs are recreated on the next build).
2. Confirm App ID `com.mayutic.ration` has **Sign in with Apple** and **Associated Domains** enabled (matches `Ration.entitlements`).
3. Confirm App Store Connect **agreements** are active and the workflow Archive action targets **App Store Connect** (not Development only).
4. Rebuild in Xcode Cloud after revoking certs.

### Pointing at a local backend

The app defaults to `https://ration.mayutic.com/api/mobile/v1`. To test against a
local `bun run dev`, add a `RATION_API_BASE` environment variable to the Run scheme
(e.g. `http://localhost:5173/api/mobile/v1`). Note the `ration://` magic-link
callback requires the universal-link/redirect to reach the device.

## Architecture

```
Ration/
├── App/            # @main entry, DI container, auth-gated root, tab shell
├── Core/
│   ├── Design/     # Theme, Typography (Space Mono), ListCountHeader, ListRowViews, VisualLanguage.md
│   ├── Filters/    # PageFilterState, FilterOptionsSheet (Cargo/Galley/Supply)
│   ├── Session/    # SessionStore — global org context + credits + AI consent
│   ├── Consent/    # AIConsentCoordinator — shared "proceed" gate for all 4 AI entry points
│   ├── Persistence/# SnapshotStore — org-scoped offline cache
│   ├── Networking/ # APIClient (auto token refresh), RationAPI facade, config
│   ├── Auth/       # AuthManager (token lifecycle), Keychain wrapper
│   ├── Billing/    # RevenueCat SDK boundary
│   └── Models/     # Codable types matching mobile API responses
└── Features/
    ├── Auth/       # Magic-link + Apple/Google social sign-in
    ├── Dashboard/  # Hub widget grid (GET /hub), customize layout
    ├── Cargo/      # Paginated list + filters + FAB
    ├── Supply/     # Shopping list with filters + dock FAB
    ├── Scan/       # Camera capture → resize → POST /scan
    ├── Galley/     # Meals CRUD, AI generate/import, match mode
    ├── Manifest/   # Week navigation, plan-week AI, consume
    ├── Settings/   # Account settings (profile, tier, appearance, privacy, sign out)
    │               # GroupSettingsView — org switch, members, invite, credits transfer
    │               # TagsSettingsView — edit name/category/color, merge, delete (with confirm)
    └── Billing/    # Paywall (RevenueCat SDK)
```

### Global shell (all tabs)

- **Leading:** `OrgSwitcherBar` — org avatar, credits, CREW pill; tap pushes **Group Settings** (rename group, members, invite, create group, transfer credits, danger zone).
- **Trailing:** `PageOptionsButton` (filters/options sheet) + `ProfileAvatarButton` (tap opens **Account Settings** sheet).
- **Org switch:** invalidates org-scoped snapshots and reloads all tabs via `orgGeneration`.

### Auth flow

**Social sign-in (v1.4.49+):** Sign in with Apple (`AuthenticationServices`) and
Google (`GoogleSignIn-iOS` SPM) obtain provider ID tokens natively. The app calls
`POST /auth/social` with the token (and Apple nonce); the server verifies via Better
Auth and returns the same JWT pair as magic-link auth. The auth screen offers **Sign In**
and **Create Account** modes: returning users sign in without a ToS checkbox; new
accounts must accept Terms of Service and Privacy Policy before any method. Configure:

- **Apple:** Enable Sign in with Apple on App ID `com.mayutic.ration` in the Apple
  Developer portal (entitlement `com.apple.developer.applesignin` is in `project.yml`).
- **Google:** Set `GOOGLE_IOS_CLIENT_ID` and `GOOGLE_IOS_URL_SCHEME` in `project.yml`
  (or scheme env vars). `GOOGLE_IOS_URL_SCHEME` is the reversed client ID
  (`com.googleusercontent.apps.<prefix>` — see `AppConfig.googleIOSURLScheme`).
  This populates `GIDClientID` and the Google callback URL scheme in `Info.plist`.

**Cross-platform sign-in:** One Ration account per person. After signing up on iOS with
Apple (including Hide My Email), sign in on [ration.mayutic.com](https://ration.mayutic.com)
with **Sign in with Apple** using the same Apple ID — not Google or a different email.
Google and magic link unify by verified email when the addresses match.

**Magic link (PKCE):** The flow uses **PKCE** so the one-time code is bound to this app — an app that
hijacks the `ration://` scheme cannot redeem an intercepted code without the
verifier.

1. App generates a PKCE `verifier` (saved in the Keychain) and
   `POST /auth/magic-link { email, codeChallenge }` (S256 challenge) → user taps the email link.
2. Link opens `/auth/mobile-callback?client=ios&code_challenge=…` → the challenge
   is bound to a one-time KV code (60s TTL) → redirects to `ration://auth/callback?code=…`.
3. `RationApp.onOpenURL` extracts the code → `POST /auth/token { grantType: "authorization_code", code, codeVerifier }`.
   The server recomputes `S256(verifier)` and rejects a mismatch with `invalid_grant`.
4. Access (15 min) + refresh (90 day) tokens are stored in the Keychain.
   `APIClient` auto-refreshes on 401 via single-flight rotation.

**Org switching** calls `POST /orgs/:id/activate`, which returns a **new** org-scoped
token pair (prior refresh families are revoked server-side); the app adopts it via
`SessionStore.activateOrg` then reloads all tabs.

**Post-delete group selection (iOS 1.1.24, web v1.5.57):** Deleting the active group
returns `{ success, organizations }` from `POST /groups/delete`. The app clears org-scoped
snapshots and presents **Select Mission Control** (`SelectGroupView`) — matching web
`/select-group`. Recovery endpoints (`GET /orgs`, `POST /orgs/:id/activate`, `POST /groups`)
accept user-only auth so a stale JWT org does not block switching. A global `forbidden_org`
handler also opens the picker when access is lost remotely.

## Mobile API routes (v1.3.48+)

### Existing (MVP)

| Route | Method | Purpose |
|-------|--------|---------|
| `/auth/social` | POST | Apple/Google ID token → mobile JWT pair |
| `/auth/magic-link` | POST | Request magic link (PKCE challenge) |
| `/auth/token` | POST | Exchange auth code or refresh token |
| `/session` | GET | User, org, credits, tier, `aiCosts` |
| `/cargo`, `/cargo/:id`, `/cargo/batch` | GET/POST/PATCH/DELETE | Inventory CRUD |
| `/meals`, `/meals/:id`, `/meals/match` | GET | Galley browse + match |
| `/meals/:id/cook`, `/meals/:id/toggle-active` | POST | Cook + supply selection |
| `/supply`, `/supply/items`, `/supply/sync`, `/supply/complete` | various | Supply list |
| `/manifest`, `/manifest/consume` | GET/POST | Meal plan |
| `/scan`, `/scan/:requestId` | POST/GET | Visual scan AI |
| `/settings` | GET/PATCH | User preferences |
| `/orgs` | GET | List groups for org picker / recovery |
| `/orgs/:id/activate` | POST | Org switch |

### New (post-MVP polish)

| Route | Method | Purpose |
|-------|--------|---------|
| `/hub` | GET | Widget grid data + layout |
| `/cargo/tags`, `/cargo/tag-index` | GET | Filter tag sources |
| `/meals/tags` | GET | Galley tag picker |
| `/meals` | POST | Create meal(s) |
| `/meals/:id` | PATCH/DELETE | Edit/delete meal |
| `/meals/generate`, `/meals/generate/:requestId` | POST/GET | AI meal ideas (2 credits) |
| `/meals/import`, `/meals/import/:requestId`, `/meals/import/confirm` | POST/GET/POST | URL import (1 credit) |
| `/manifest/plan-week`, `/manifest/plan-week/:requestId` | POST/GET | AI week plan (3 credits) |
| `/manifest/bulk` | POST | Bulk add plan entries |
| `/manifest/entries/:entryId` | DELETE | Remove manifest entry |
| `/groups/members` | GET | List group members |
| `/groups` | POST | Create group (`{ name }`; slug auto-generated) |
| `/organization/profile` | PATCH | Rename active group display name (`{ name }`, owner/admin) |
| `/groups/delete` | POST | Delete group (owner); returns remaining `organizations` |
| `/groups/invitations/create` | POST | Create invite link |
| `/groups/members/:memberId/role` | PATCH | Change member role |
| `/groups/ownership/transfer` | POST | Transfer group ownership |
| `/groups/credits/transfer` | POST | Transfer credits between owned groups |

Settings PATCH accepts `hubProfile` and `hubLayout` for customizable Hub widgets. Per-widget filters include meal tags, manifest day span (1/3/7/14), supply cargo tags, slot/domain, and limits — synced with web `hubLayout`. Reorder widgets in Hub edit mode (toolbar slider) via swipe Up/Down; layout saves optimistically in the background. Edit mode also supports visibility toggles and S/M/L sizing. **Appearance** (Settings → Light/Dark segmented control) updates `user.settings.theme` and syncs with the web app; choice is cached in UserDefaults for instant cold start.

**Post-buildout UX overhaul (v1.4.18):** Trailing `ListCountHeader` (`"{n} items"`) on Cargo, Galley, and Manifest; toolbar count pill removed. Space Mono typography shipped with Dynamic Type scaling. Unified Telemetry Strip rows (`CargoRowView` / `MealRowView`) with hyper-green tag chips. Rich connected-meals section on Cargo detail (connection badges, all ingredients, sort). Manifest incremental polish (consumed strikethrough, week navigator density). See [`VisualLanguage.md`](Ration/Core/Design/VisualLanguage.md).

**Post-buildout polish (v1.4.4–1.4.5):** Conditional sync indicator in toolbar (offline/stale only); structured recipe directions with step UI; unified AI intro+form flows; hub widgets are tappable with detail sheets; manifest preview supports day-span filters and consume-from-hub; Supply uses thin progress bar + icon dock FAB. **v1.4.5** adds icon-only action menus on Cargo/Galley/Manifest/Hub, hub layout presets (Full/Cook/Shop/Minimal), per-widget S/M/L size editing, and slot glyphs on manifest rows.

**Security hardening (v1.4.6–v1.4.11, iOS security audit fix plan):** `PrivacyInfo.xcprivacy` privacy manifest (v1.4.6); centralized/symmetric AI consent gate across all four AI entry points via `SessionStore.hasAIConsent` + `AIConsentCoordinator`, and server-side consent enforcement added to `/scan` (v1.4.8); forced-logout full wipe (`AuthManager.onSignedOut` → snapshots/billing/session/image caches) plus abandoned-PKCE-verifier Keychain cleanup on every sign-out (v1.4.9); mobile `/hub` and `/supply` rate limiting + pagination, and a `preLimit` fix for `/meals/match` (v1.4.10); post-review cleanup — explicit sign-out now routes through the same `onSignedOut` wipe hook instead of duplicating it, and `RootView`'s startup fetches (`session.load`, settings) run concurrently and are shared between the AI consent flag and the onboarding check instead of double-fetching `/settings` (v1.4.11). See [`plans/ios-security-audit-fix-plan.md`](../plans/ios-security-audit-fix-plan.md).

**Copilot stacked dock (v1.5.22):** `CopilotBottomDock` unifies Copilot input and tab action FABs in a single glass overlay above the tab bar. When expanded, the input bar spans full width and the tab FAB sits above it (trailing); scroll down to collapse the bar to a chat chip and the FAB lowers to the bottom-right row. Tab actions register via `.tabDockAction(tag:)` (`TabDockContext`) instead of per-tab `safeAreaInset` FABs — eliminating the blank dead zone from stacked insets. `List` surfaces use `.copilotDockScrollMargins` (`contentMargins` + `CopilotDockLayout`); plain `ScrollView` content (Hub widgets) uses `.copilotDockContentPadding` (bottom padding on scroll content) so scrolling stays responsive. Full chat opens in `AskView` sheet; inline send from the bar auto-opens the sheet. WebSocket frames use lenient agent-protocol parsing (`CopilotWebSocketDecoder`) matching web `AskPanel`.

**Post-buildout stability (iOS 1.1.1 build 5, web v1.5.30):** Single-line Copilot input with rotating example placeholders (no stacked hint row). Keyboard dismisses on scroll, send, dock collapse, tap on list content, and Done toolbar. Scroll margins stay stable during dock collapse and grow when the keyboard is visible so the last row clears the keyboard. Supply sync uses the Manifest calendar window; post-dock reconcile passes the syncing user's settings.

**Performance and offline fluidity (iOS 1.1.3 build 7, web v1.5.43):** Snapshot JSON and file access run through the `SnapshotDiskWorker` actor instead of `MainActor`. Hub, Cargo, Galley, Manifest, and Supply restore org-scoped cache before network refresh (stale-while-revalidate), retain cached content on refresh failure with an explicit error, and reserve layout space for stale-data banners. Snapshot write generations prevent an in-flight task from recreating old account data after logout, account deletion, org switch, or Copilot new-chat clearing. Copilot coalesces streaming snapshot writes, lets readers pause auto-follow and jump back to the latest message, and includes keyboard height in dock-safe scroll margins. MetricKit payloads are retained locally under Application Support with bounded retention and no console or PII logging.

**Beauty & modernity polish (iOS 1.1.4 build 8, web v1.5.44):** Typography tokens keep Space Mono text Dynamic Type-aware while `Typography.heroIcon()` provides fixed-size native SF Symbols for reserved control geometry. `Theme.onHyperGreen` replaces ad-hoc black on Hyper-Green surfaces. `RationAdaptiveMaterial` provides Reduce Transparency fallbacks for dock/FAB/composer chrome. Lists retain stable model IDs and native SwiftUI invalidation so every rendered field, environment change, and navigation input stays current. `EmptyStateView` adds optional CTAs and restrained symbol pulse. DEBUG `PerformanceSignposts` instrument snapshot load/save. Dead `FloatingActionBar` removed. Extended Sprint 3 QA checklist below.

**Copilot immersive chat (iOS 1.1.7 build 8):** Dock and full-screen chat now share a floating composer that starts as one line, grows to five lines, submits from Return or the send arrow, and dismisses interactively with a downward swipe. The full chat uses a compact single-row header, full-width assistant responses, right-aligned user bubbles, stable distance-based auto-follow, and a morphing dock-to-chip transition. Multi-turn streaming now appends each response after its prompt; session-limit recovery and late-frame filtering match web behavior.

**Copilot reliability pass (iOS 1.1.12 build 8):** Restores Copilot send/stream lifecycle parity with web — non-response agent frames are ignored, event observation is ready before connect, and the composer clears after Return while the keyboard stays open. Sticky activity shows during connect/thinking until assistant tokens arrive. Scroll tracking refreshes when tabs activate so dock collapse works on Cargo/Galley/Manifest/Supply. Composer height remeasures after UIKit layout instead of at width ≈ 1pt.

**Onboarding (iOS 1.1.29):** Ask-first welcome briefing replaces the seven-step tour. New users see full-screen Ask Ration with one auto-sent bootstrap prompt and a single server-capped Copilot response (`copilot-onboarding-free` flag). **Enter Ration** completes onboarding; chips route to Cargo or pricing (no WELCOME65 in briefing — RevenueCat rail). Settings → Tutorial replays static copy only via `restartOnboarding` PATCH.

**Quiet revalidate (iOS 1.1.16 build 12):** Cold open and foreground resume no longer flash warning banners while background refresh runs. Cached content appears instantly; stale disclosure is muted ("Last updated …") and suppressed during refresh and a 15s foreground grace window. `SnapshotLoadCoordinator` coalesces overlapping `.task` and pull-to-refresh loads; `AuthManager` token rotation uses a detached task so SwiftUI cancellation cannot abort shared refresh. `CancellationError` is never surfaced to users. Network reachability debounces brief offline flaps; returning online triggers a debounced active-tab refresh.

**Detail dock FAB (iOS 1.1.22):** Cargo item and Galley meal detail screens register their `⋯` action menus in `CopilotBottomDock` via `.tabDockAction` (same chrome/animations as list `+` FABs). `TabDockContext` uses a per-tab push/pop stack so detail temporarily replaces the active tab's list FAB and restores it on pop. Detail scroll surfaces use `.copilotDockScrollMargins` instead of legacy `safeAreaInset` FABs.

**Red delete standard (iOS 1.1.23):** Swipe-to-delete and button-driven delete actions use explicit `Theme.danger` tint via shared helpers in `ListSwipeActions` (`destructiveTrailingSwipe`, `destructiveDeleteTint`, `destructiveDeleteForeground`) so delete controls stay red under the app-wide Hyper-Green accent. Covers Cargo, Galley, Manifest, Supply, Plan Week draft rows, detail FAB menus, settings delete flows, and edit-mode list deletes.

**Copilot dock tab bar clearance (iOS 1.1.32 build 18):** `CopilotBottomDock` adds explicit `tabBarClearance` padding inside `TabView.safeAreaInset` so the composer sits above the tab bar (SwiftUI inset alone was overlapping icons). Removed the 28pt `bottomFade` strip that drew a visible band through tab labels. Dock composer uses compact single-line `TextField` until the draft contains a newline.

**Copilot keyboard native UX (iOS 1.1.30 build 16):** Shared SwiftUI `TextField(axis: .vertical)` composer with `@FocusState` in tab dock and Ask sheet — keyboard and composer move as one unit without UITextView bridge hacks. Submit from tab dock dismisses keyboard, opens full Ask, and shows the user prompt plus Copilot thinking/tool activity in the transcript. Chevron-only keyboard dismiss (no Done toolbar). Fixed scroll margins with visual-only dock collapse; scroll-phase tracking defers dock toggle until flings settle. Hub widget reorder moves to edit mode only so home scroll stays fluid.

**Copilot keyboard native UX (iOS 1.1.27 build 14):** Copilot dock uses `TabView.safeAreaInset` so SwiftUI lifts the composer above the keyboard (no manual overlay padding). UITextView locks ancestor `UIScrollView` scrolling while editing to prevent TabView fly-to-top. Keyboard dismiss uses standard iOS affordances: chevron-down on the composer, keyboard toolbar Done, and `inputAccessoryView` Done bar. Ask Ration opens via `fullScreenCover` (not `.sheet`) so swipe-down dismisses the keyboard without closing chat. Scroll margins no longer double-count keyboard height when the dock is inset-managed.

**Copilot keyboard positioning and dismiss (iOS 1.1.19 build 12):** Inline dock overlays ignore SwiftUI's automatic keyboard safe area so manual `keyboardInset` padding is the single source of truth — the composer stays directly above the keyboard instead of flying to the top. Shared `CopilotKeyboardDismissPolicy` and a UIKit pan bridge on the composer capsule provide interactive swipe-down dismiss on both the dock and Ask sheet; dock padding interpolates with drag progress. Ask transcript always uses `scrollDismissesKeyboard(.interactively)`. Standard dismiss paths: swipe down on the composer, scroll the content behind it, or tap outside the dock.

**Copilot device QA checklist (before release):**
- Galley expanded: input spans full width; `+` FAB sits above trailing edge (not beside input).
- Galley/Cargo scroll down: bar collapses to chat chip; FAB animates down to bottom-right row.
- List rows scroll visibly behind the glass dock — no large blank band above the controls.
- Ask sheet: send a tool turn (e.g. “add butter to cargo”) — tool card appears, no red decode error banner after completion.
- Hub edit mode: scan FAB hidden; Supply empty list: replenish FAB hidden.
- Cargo item detail: only `⋯` visible (no `+`), not hidden under Copilot composer; pop back restores `+` FAB.
- Galley meal detail: same `⋯` dock behavior; scroll last card clears dock; dock collapse on scroll still works.
- Galley meal → ingredient link → cargo detail (tab 2): `⋯` replaces Galley `+` on active tab.
- Manifest entry → meal detail: `⋯` replaces Manifest tab FAB.
- Tab switch resets bar to expanded when allowance allows auto-expand; keyboard must stay closed until the composer is tapped.
- Collapsed chat chip: tap expands the bar and opens the keyboard; scroll-up expand alone must not open the keyboard.
- With keyboard open on any tab: composer stays directly above keyboard (not at top of screen).
- Copilot field: tap chevron-down to dismiss keyboard; scroll list/transcript to dismiss interactively.
- Tab dock send: prompt appears in Ask transcript with thinking/tool activity; keyboard dismisses on tab before Ask opens.
- Ask full screen: swipe down on composer dismisses keyboard only (chat stays open); X button closes chat.
- Single-line copilot bar: rotating example placeholder only (no static "Ask Ration…" row above field).
- Fast scroll on Cargo/Galley/Supply long lists (30s fling): no crash, dock collapse still works.
- During a long Copilot response, scroll upward: reading position remains stable; “Jump to latest” resumes auto-follow.
- Send at least three consecutive Copilot turns: every assistant response appears below the matching user prompt.
- On both the dock and Ask sheet, tap Return and the send arrow separately: each submits exactly once.
- Type a long prompt: the composer remains one line until text wraps, grows through five lines, then scrolls internally.
- With the keyboard open, swipe down over the composer and transcript: the keyboard follows the gesture and dismisses without moving the transcript to the top.
- Ask sheet: header stays on one compact row; assistant responses use the full content width; user messages remain right-aligned.
- Ask sheet: after send, sticky activity bar shows “Copilot is thinking” (or tool label) until assistant text streams in.
- Repeat dock collapse/expand on Hub, Cargo, Galley, Manifest, and Supply: behavior must match (no stuck chip, no stuck expanded bar).
- Empty Cargo/Galley/Manifest/Supply lists and Hub edit mode: scroll down still collapses the dock to the chat chip.
- Ask sheet: with composer unfocused, swipe the transcript to dismiss keyboard; with composer focused, swipe-down on the capsule still dismisses.
- Return to a previously scrolled tab: the first restored offset does not spuriously collapse the Copilot dock.
- Trigger an expired/session-limit conversation: the stale transcript clears and the next turn starts a new conversation.
- Open each tab with a warm cache and delayed network: cached content appears without an empty flash or warning banner; refresh spinner remains visible.
- Fail a refresh while cache is visible: cached content remains and a refresh error is announced instead of appearing fresh.
- Cold open after 1h away: no warning banner during the first 15s; muted "Last updated …" caption only if refresh fails and data remains stale after grace.
- Pull-to-refresh during startup: no `CancellationError` banner; overlapping loads coalesce silently.
- Restore network after airplane mode: active tab refreshes without user action.
- Leave a cached tab open past the 30-minute threshold (after grace): the muted stale caption appears without covering the first row.
- Force logout as a Copilot response completes, then sign in as another user: no prior conversation snapshot is restored.

**Sprint 3 beauty & accessibility QA (before release):**
- Settings → Accessibility → Display & Text Size → Larger Text (AX5): Copilot dock, week navigator, sign-in CTAs, list rows — no clipping.
- Reduce Transparency ON: Icon FAB, Copilot dock, Ask composer use opaque `Theme.surface` (no illegible blur).
- Reduce Motion ON: `EmptyStateView` pulse, AI processing ring, Copilot streaming cursor — no infinite animation.
- VoiceOver: Cargo row announces expiry urgency band; filter button reports active-filter state; onboarding dots announce step X of Y.
- Empty Cargo/Galley/Supply/Manifest lists: centered symbol hero, readable copy, no layout jump when data arrives.
- Instruments (DEBUG): `SnapshotLoad` / `SnapshotSave` signposts visible under Performance category during tab open.

## Security notes

- Tokens live in the Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
- The magic-link → code exchange is PKCE-protected (S256), so the `ration://`
  custom scheme cannot be abused to steal an intercepted auth code. Any orphaned
  verifier (e.g. an abandoned magic-link request) is deleted from the Keychain on
  every sign-out, not just a successful code exchange.
- No secrets are committed (`.gitignore` excludes `*.p8`, `Secrets.xcconfig`, provisioning).
- All requests are HTTPS; org isolation is enforced server-side from the JWT claim.
- Offline snapshots are scoped per `organizationId`; org switch clears stale cache.
  A **forced logout** (401 from an expired/revoked token) runs the same full wipe
  as explicit sign-out — snapshots, billing session state, the in-memory
  `SessionStore` cache, and cached authenticated images — via
  `AuthManager.onSignedOut`, wired once in `AppEnvironment.init()`. This closes a
  shared-device cross-account data leakage gap where a forced logout previously
  left another user's cached pantry/session data readable by the next sign-in.
- AI features require `aiConsentAt` in settings; server returns 403 `ai_consent_required`
  otherwise (enforced on all four AI entry points: scan, generate, import, plan-week).
  Client-side, a single `SessionStore.hasAIConsent` flag (loaded once at app start)
  and a shared `AIConsentCoordinator` ensure the full-screen consent gate is shown
  at most once across all four entry points, regardless of which one the user
  reaches first.
