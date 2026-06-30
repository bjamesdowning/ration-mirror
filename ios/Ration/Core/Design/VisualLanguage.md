# iOS Visual Language

Symbol-first UI patterns for Ration native. Piloted on Supply (v1.4.4), rolled out app-wide in v1.4.5.

## Principles

1. **Primary actions** — SF Symbol in toolbar or icon FAB; text label only in VoiceOver.
2. **Progress** — Thin 2–4pt bar at list top (`safeAreaInset`), not a footer card.
3. **Metadata** — Symbol + number before words (`cart 3` not `3 items to buy`).
4. **Orbital aesthetic** — Ceramic backgrounds, GlassCard for grouped content, Hyper-Green for primary/AI only.
5. **Accessibility** — `.accessibilityLabel` on every icon-only control.

## Components

| Component | File | Usage |
|-----------|------|-------|
| `ThinProgressBar` | `ThinProgressBar.swift` | Supply shopping progress |
| `IconFAB` / `IconFABButton` | `IconFAB.swift` | Cargo, Galley, Manifest, Hub scan |
| `SlotGlyphView` | `SlotGlyph.swift` | Manifest meal-plan rows |
| `SyncIndicatorIcon` | `SyncIndicator.swift` | Offline/stale toolbar affordance |

## Per-page patterns

- **Supply** — Top progress bar + icon dock menu (pilot).
- **Cargo / Galley / Manifest** — Single `plus.circle.fill` icon FAB with action menu.
- **Hub** — Icon scan FAB; stats cells are icon + number first.
- **Manifest rows** — Slot glyph circle + meal name (no inline slot text).

## Hub layout

- **Presets** — Full, Cook, Shop, Minimal profiles selectable in edit mode.
- **Widget size** — S/M/L segmented control per widget; drives row density in widget views.
