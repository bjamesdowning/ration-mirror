# iOS Visual Language

Symbol-first UI patterns for Ration native. Piloted on Supply (v1.4.4), rolled out app-wide in v1.4.5.

## Principles

1. **Primary actions** — SF Symbol in toolbar or icon FAB; text label only in VoiceOver.
2. **Progress** — Thin 2–4pt bar at list top (`safeAreaInset`), not a footer card.
3. **List totals** — Trailing `"{n} items"` caption at list top (`ListCountHeader`); toolbar stays symbol-only (no count pill).
4. **Orbital aesthetic** — Ceramic backgrounds, GlassCard for grouped content, Hyper-Green for primary/AI only.
5. **Accessibility** — `.accessibilityLabel` on every icon-only control.

## Components

| Component | File | Usage |
|-----------|------|-------|
| `ThinProgressBar` | `ThinProgressBar.swift` | Supply shopping progress |
| `IconFAB` / `IconFABButton` | `IconFAB.swift` | Cargo, Galley, Manifest, Hub scan |
| `SlotGlyphView` | `SlotGlyph.swift` | Manifest meal-plan rows |
| `SyncIndicatorIcon` | `SyncIndicator.swift` | Offline/stale toolbar affordance |
| `ListCountHeader` | `ListCountHeader.swift` | Trailing inventory total on Cargo, Galley, Manifest |
| `TelemetryTagChip` | `ListRowViews.swift` | Hyper-green tag chips (`Theme.tagChipForeground` / `Theme.tagChipBackground`) |
| `CargoRowView` / `MealRowView` | `ListRowViews.swift` | Unified Telemetry Strip list rows |
| `ManifestEntryRow` | `ListRowViews.swift` | Manifest day entries (slot glyph + consume) |

## Typography

- **Space Mono** (Regular + Bold) bundled in `Resources/Fonts/`; registered via `UIAppFonts`.
- Scale via `UIFontMetrics` in `Typography.swift` for Dynamic Type.
- Use `.rationBody()`, `.rationCaption()`, etc. — avoid raw `.system` fonts in new views.

## Per-page patterns

- **Supply** — Top progress bar + icon dock menu (pilot).
- **Cargo / Galley / Manifest** — Single `plus.circle.fill` icon FAB with action menu.
- **Hub** — Icon scan FAB; stats cells are icon + number first.
- **Manifest rows** — Slot glyph circle + meal name (no inline slot text).

## Hub layout

- **Presets** — Full, Cook, Shop, Minimal profiles selectable in edit mode.
- **Widget size** — S/M/L segmented control per widget; drives row density in widget views.
