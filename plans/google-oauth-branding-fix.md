# Google OAuth Branding Verification Fix

## Overview

Google OAuth verification fails because the privacy policy link and app purpose are not prominent enough for their automated crawler. Replace the current status banner with a consolidated header that meets verification requirements and follows industry-standard patterns.

## Root Cause

| Requirement | Current State | Why It Fails |
|-------------|---------------|--------------|
| **Privacy Policy link** | In AuthWidget fine print + footer | Google expects it "prominently displayed" in a header/nav |
| **App purpose** | Hero tagline only | May need a dedicated, explicit "About" section |

## Header Design (Replaces Current Status Banner)

**Remove:** The existing top bar:
```tsx
{/* Status Banner */}
<div className="relative z-50 bg-hyper-green/10 border-b border-hyper-green/20 p-2 text-center">
  <p className="text-xs uppercase tracking-wider font-bold text-carbon">
    <span className="inline-block w-1.5 h-1.5 rounded-full bg-hyper-green mr-1.5 align-middle animate-pulse" aria-hidden />
    Live {" // "}v{APP_VERSION}
  </p>
</div>
```

**Add:** A consolidated header with industry-standard layout:

- **Left:** Logo (links to `/`)
- **Right:** Nav links + Live indicator + version
  - **Pricing** — anchor link `href="#pricing"` (scrolls to pricing section)
  - **Terms** — `href="https://ration.mayutic.com/legal/terms"`
  - **Privacy** — `href="https://ration.mayutic.com/legal/privacy"`
  - **Live icon** — pulse dot (existing visual)
  - **Version** — `v{APP_VERSION}`

Layout follows common SaaS expectations: logo left, nav right, compact single-row header with clear legal links.

### Header Structure (Sketch)

```tsx
<header className="relative z-50 flex items-center justify-between px-6 py-3 border-b border-carbon/10 bg-ceramic">
  <Link to="/" className="...">
    <img src="/static/ration-logo.svg" alt="Ration" className="h-8 md:h-9" />
  </Link>
  <nav className="flex items-center gap-4 md:gap-6 text-sm text-muted">
    <a href="#pricing" className="hover:text-hyper-green transition-colors">Pricing</a>
    <a href="https://ration.mayutic.com/legal/terms" className="hover:text-hyper-green transition-colors">Terms</a>
    <a href="https://ration.mayutic.com/legal/privacy" className="hover:text-hyper-green transition-colors">Privacy</a>
    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
      <span className="w-1.5 h-1.5 rounded-full bg-hyper-green animate-pulse" aria-hidden />
      Live · v{APP_VERSION}
    </span>
  </nav>
</header>
```

- Use `scroll-mt-*` on the pricing section for smooth scroll offset
- Mobile: consider stacking or hamburger if links don’t fit; keep at least Privacy + Live/version visible

## Required Page Changes

### 1. Add `id="pricing"` to Pricing Section

**File:** `app/routes/home.tsx`

```tsx
<section id="pricing" className="w-full max-w-5xl space-y-10 border-t border-carbon/10 pt-16 md:pt-24 scroll-mt-24">
```

### 2. Strengthen App Purpose (Hero)

Add or expand an explicit "About Ration" paragraph:

```tsx
<p className="text-muted text-base max-w-2xl mx-auto">
  Ration is a kitchen inventory and meal-planning application that helps you track
  what you have (Cargo), plan meals (Galley, Manifest), and generate shopping
  lists (Supply). It uses AI for receipt scanning and recipe import, and supports
  households with shared groups and credits.
</p>
```

### 3. Design Notes

- Use design tokens: Ceramic, Carbon, Hyper-Green
- Ensure header is sticky or always above the fold for crawler visibility
- Use absolute URLs for Terms and Privacy for maximum compatibility
- Responsive: on small screens, show all items or use a compact pattern (e.g. grouped links + Live/version)

## Verification Checklist

- [ ] Header replaces status banner
- [ ] Pricing anchor scrolls to pricing section
- [ ] Terms and Privacy use absolute URLs
- [ ] Live icon + version visible
- [ ] App purpose text present in hero
- [ ] Deploy and resubmit for Google OAuth brand verification
