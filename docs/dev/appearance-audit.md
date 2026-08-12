# Appearance / dark-mode audit log

Last pass: 2026-08-12 (Dark Mode Color Scheme & Appearance Audit).

Theme contract: see README **Appearance & theming**. Tokens remapped by theme live in [`app/app.css`](../../app/app.css) and [`ios/Ration/Core/Design/Theme.swift`](../../ios/Ration/Core/Design/Theme.swift).

## Violation taxonomy

| Code | Meaning |
|------|---------|
| Light-only chrome | `bg-white` / gray hovers without dark variants |
| Inverted token | `carbon` used as fill/scrim; `dark:bg-carbon`; `dark:text-ceramic` |
| Contrast fail | Low-contrast label/control |
| Non-standard loading | Bare system ProgressView / mismatched wait chrome |
| Hardcoded hex drift | One-off colors instead of tokens |
| System chrome bleed | System Form/List materials vs Theme ceramic |
| Extension/out-of-app | Share extension / email light-locked |

## Findings

| Severity | Surface | File | Type | Status |
|----------|---------|------|------|--------|
| P0 | Settings Members invite Copy | `app/routes/hub/settings.tsx` | Light-only chrome | Fixed — Hyper-Green Copy + platinum/dark input |
| P0 | Dock / ConfirmDialog backdrop | `app/components/shell/ConfirmDialog.tsx` | Inverted token | Fixed — `backdrop:bg-black/50` |
| P0 | iOS Import confirming wait | `ios/.../ImportRecipeSheet.swift` | Non-standard loading | Fixed — `AIProcessingView` + title override |
| P1 | Modal overlays (`bg-carbon/*`) | Multiple modals/sheets | Inverted token | Fixed — `.modal-scrim` / `.modal-scrim-heavy` |
| P1 | Modal shells `dark:bg-carbon` | Replenish*, SupplyScanReview | Inverted token | Fixed — `.modal-surface` |
| P1 | `dark:text-ceramic` (dark text on dark) | Dock fields, settings, help, horizon | Inverted token | Fixed — `text-carbon` only |
| P1 | WeekView non-today columns | `WeekView.tsx` | Light-only chrome | Fixed — platinum / `dark:bg-white/5` |
| P1 | Scan/Galley import card fills | ScanResultsModal, GalleyImportPreview | Inverted token | Fixed — platinum / white tints |
| P1 | API key reveal input | `ApiKeysPanel.tsx` | Light-only chrome | Fixed — theme-aware input |
| P2 | Share Extension light-locked | `ios/RationShare/ShareViewController.swift` | Extension | Fixed — adaptive ceramic/carbon UIColors |
| P2 | Bare labeled ProgressViews | SelectGroup, GroupSettings, AccountDeletion, PlateUp | Non-standard loading | Mitigated — Hyper-Green tint (+ material where present) |
| P3 | System `Form` sheets | Cargo/Meal/Supply forms, privacy | System chrome bleed | Accepted for now — inherit forced scheme; ceramic list bg where scrolled |
| P3 | Tiny indicator dots `bg-carbon/40|50` | DayTab, ManifestCalendarOverlay | Inverted token (benign) | Accepted — remapped carbon as “current ink” tint |
| P3 | Subtle `bg-carbon/5|10` washes | Marketing, blog, badges | Inverted token (benign) | Accepted — light wash in dark reads as frosted highlight |
| n/a | Email HTML | `email.server.ts` | Extension | Out of scope — intentionally light |
| n/a | Mermaid / prose code chrome | Blog | Hardcoded hex drift | Out of scope unless in hub chrome |

## Guardrails

- CSS: `.modal-scrim`, `.modal-scrim-heavy`, `.modal-surface` in `app/app.css`
- Copy/share fields: prefer Hyper-Green Copy + `bg-platinum/50 dark:bg-white/5` (see `CopyField`)
- iOS waits: prefer `AIProcessingView` for full-screen AI/confirm states
- Unit test: `app/lib/__tests__/theme-class-guardrails.test.ts` forbids hub `dark:bg-carbon`, `backdrop:bg-carbon`, and `hover:bg-gray-50`
