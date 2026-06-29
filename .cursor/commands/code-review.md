# Code Review Checklist

Conduct a thorough code review following Ration's quality standards before merging changes.

## Pre-Merge Checks

### 1. Build & Type Safety
- [ ] `bun run lint` passes without errors
- [ ] `bun run typecheck` passes without type errors
- [ ] `bun run test:unit` passes (all tests green)
- [ ] If `ios/` or mobile API contracts changed, `bun run ios:check` passes on a Mac with full Xcode + iOS simulator runtime
- [ ] No `console.log` statements in production code
- [ ] No unused variables or imports

### 2. Cloudflare Workers Compatibility
- [ ] No Node.js APIs used (`fs`, `net`, `child_process`)
- [ ] All environment access uses `context.cloudflare.env`
- [ ] No `process.env` direct access

### 3. React Router Patterns
- [ ] No `useEffect` for data fetching (use loaders instead)
- [ ] Mutations use `useFetcher` with optimistic UI where appropriate
- [ ] Route files follow existing patterns in `app/routes/`

### 4. Security
- [ ] All API inputs validated with Zod schemas
- [ ] Authentication checks present (`requireAuth`, `requireActiveGroup`)
- [ ] Row-level security enforced (queries use `user_id` from session)
- [ ] No secrets or API keys in code
- [ ] iOS `Info.plist` contains only public SDK keys (for example RevenueCat public iOS key), never server `sk_`, `strp_`, Stripe, Better Auth, or `.p8` secrets
- [ ] iOS auth handoff uses a reviewed approach (Universal Links / Associated Domains preferred; custom schemes carrying auth codes are a TestFlight blocker unless explicitly waived)
- [ ] Rate limiting considered for expensive endpoints

### 5. Database
- [ ] Schema changes originate in `app/db/schema.ts`
- [ ] Migrations generated and tested locally
- [ ] Batch operations used for multi-step transactions
- [ ] Vectorize sync maintained if inventory changes

### 6. Code Quality
- [ ] Functional programming patterns preferred
- [ ] Components are small and single-responsibility
- [ ] TypeScript interfaces for all props and API responses
- [ ] Error handling uses `handleApiError` pattern
- [ ] Swift/iOS changes have Xcode build evidence; `swiftc -parse` alone is not sufficient for SwiftUI/UIKit/RevenueCat work

### 7. Design & UX
- [ ] Follows "Orbital Luxury" design language
- [ ] Uses design tokens (Ceramic, Platinum, Hyper-Green, Carbon)
- [ ] Mobile-first responsive design
- [ ] Primary actions accessible in "Thumb Zone"
- [ ] Native iOS screens use Ration design tokens/components from `ios/Ration/Core/Design/`

## Review Summary

After completing the checklist, provide:
- Summary of changes
- Any concerns or potential issues
- Suggestions for improvement
- Approval status
