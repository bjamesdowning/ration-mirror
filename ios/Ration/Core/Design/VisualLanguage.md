# iOS Visual Language

Symbol-first UI patterns for Ration native. Piloted on Supply (v1.4.4), rolled out app-wide in v1.4.5.

## Principles

1. **Primary actions** — SF Symbol in toolbar or icon FAB; text label only in VoiceOver.
2. **Progress** — Thin 2–4pt bar at list top (`safeAreaInset`), not a footer card.
3. **List totals** — Trailing `"{n} items"` caption at list top (`ListCountHeader`); toolbar stays symbol-only (no count pill).
4. **Orbital aesthetic** — Ceramic backgrounds, GlassCard for grouped content, Hyper-Green for primary/AI only.
5. **Accessibility** — `.accessibilityLabel` on every icon-only control.
6. **Cached state** — Keep usable content visible during refresh; reserve space with `safeAreaInset` for stale/error banners instead of covering rows.

## Components

| Component | File | Usage |
|-----------|------|-------|
| `ThinProgressBar` | `ThinProgressBar.swift` | Supply shopping progress |
| `IconFAB` / `IconFABButton` | `IconFAB.swift` | Cargo, Galley, Manifest, Hub scan |
| `SlotGlyphView` | `SlotGlyph.swift` | Manifest meal-plan rows |
| `SyncIndicatorIcon` | `SyncIndicator.swift` | Offline/stale toolbar affordance |
| `StaleDataBanner` | `SyncIndicator.swift` | Timed stale-cache disclosure above snapshot-backed content |
| `ListCountHeader` | `ListCountHeader.swift` | Trailing inventory total on Cargo, Galley, Manifest |
| `TelemetryTagChip` | `ListRowViews.swift` | Hyper-green tag chips (`Theme.tagChipForeground` / `Theme.tagChipBackground`) |
| `CargoRowView` / `MealRowView` | `ListRowViews.swift` | Unified Telemetry Strip list rows |
| `ListSwipeActions` | `ListSwipeActions.swift` | Shared inventory swipe modifiers (Cargo, Galley) |
| `ManifestEntryRow` | `ListRowViews.swift` | Manifest day entries (slot glyph + consume) |

| `RationAdaptiveMaterial` | `RationAdaptiveMaterial.swift` | Frosted surfaces with Reduce Transparency fallback |

## Typography

- **Space Mono** (Regular + Bold) bundled in `Resources/Fonts/`; registered via `UIAppFonts`.
- Scale via `Font.custom(…, relativeTo:)` in `Typography.swift` for Dynamic Type.
- Use `.rationBody()` / `.rationCaption()` for scalable Space Mono text.
- Use `Typography.heroIcon()` for fixed-size SF Symbols inside reserved control geometry; never apply scalable custom text fonts to symbols.
- Hyper-Green label text uses `Theme.onHyperGreen`, not ad-hoc `Color.black`.

## Motion & haptics

- **Motion tokens** live in `MotionPolicy.swift` — restrained springs and short fades; infinite pulses respect Reduce Motion.
- **Haptics** — `Haptics.light()` for toggles/FAB taps; `success`/`warning`/`error` for outcomes. Generators are prepared before firing.
- **Materials** — prefer `RationAdaptiveMaterial` over raw `.ultraThinMaterial` so Reduce Transparency falls back to `Theme.surface`.

## Empty states

- Use `EmptyStateView` for list/sheet zero-data states — symbol hero icon, title, message, optional secondary CTA.
- Empty icons use a subtle pulse when Reduce Motion is off; combined accessibility element for VoiceOver.

## Per-page patterns

- **Supply** — Top progress bar + icon dock menu (pilot).
- **Cargo / Galley / Manifest** — Single `plus.circle.fill` icon FAB with action menu.
- **Hub** — Icon scan FAB; stats cells are icon + number first.
- **Manifest rows** — Slot glyph circle + meal name (no inline slot text).

## List swipe conventions

Inventory-style lists share one dual-edge pattern via `inventoryLeadingSwipeActions` and `inventoryDestructiveTrailingSwipe`:

| Gesture | Edge | Actions | Tint |
|---------|------|---------|------|
| Swipe right | Leading | Add/Remove Supply, Edit | Hyper-Green, Carbon |
| Swipe left | Trailing | Delete | Destructive (system red) |

**Where applied:** Cargo (inventory + search), Galley (meals + match mode).

**Domain actions stay inline** (not swipes): Galley Cook (`flame.circle.fill` on row), Manifest Consume (`fork.knife.circle.fill`), Supply Check (leading swipe is the primary list action for shopping — see Supply below).

**Other list deviations (documented, unchanged):**

- **Supply** — Leading Check when unpurchased; trailing Snooze + Delete.
- **Manifest / Plan week** — Trailing Delete only; consume is inline on the row.
- **Hub edit** — Trailing reorder (Up/Down), not inventory CRUD.

**Add flows** — Tab dock `IconFABMenuCore` menus; not swipe gestures.

## Hub layout

- **Presets** — Full, Cook, Shop, Minimal profiles selectable in edit mode.
- **Widget size** — S/M/L segmented control per widget; drives row density in widget views.
