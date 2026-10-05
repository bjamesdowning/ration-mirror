# iOS Home Screen widgets

Flag: `ios-home-widgets` (`clientKey` `iosHomeWidgets`), default **off**. The operator creates the Flagship flag disabled. This build does not enable it.

Pattern C. Web `1.9.21`. iOS marketing `1.5.2`, build `137`.

## What ships

One WidgetKit extension (`com.mayutic.ration.widgets`) with three static widgets.

| Widget | Families | Action |
| --- | --- | --- |
| Supply | Small, medium, Lock Screen | Medium: up to five unchecked **Live** rows. A row marks that item purchased. It does not dock to Cargo. “+” and the header open Live with the jot sheet focused so the keyboard (and dictation) can take “butter, eggs, bread”. Lock Screen shows names and a count only. |
| Ate | Small (2), medium (4) | Count units (unit, piece, slice, can, pack, and the other discrete counts except dozen) eat **1** of that unit via Quick Eat. Grams, millilitres, and dozen open the in-app Quick Eat sheet. One-tap also requires `cargo-quick-eat`. |
| Today | Small, medium | Read-only. Next uncooked meal, or “Nothing planned” / “All cooked”. Medium adds the Live unchecked count and remaining kcal only when goals, Manifest, and intake/goals consent are on. |

No Control Center, Live Activity, or Siri intent. Mutation intents are not discoverable in Shortcuts.

## Mechanism

`GET /api/mobile/v1/widgets/home?date=YYYY-MM-DD` is the only new endpoint. The date is the device’s local calendar day. The handler uses `requireMobileActiveGroup` (session org, never a client org id), rate-limits like other supply reads, and `assertFeatureEnabled("ios-home-widgets")` before any query. Flag off is **403** `FEATURE_DISABLED` and an empty widget that says widgets are turned off. No grocery names and no kcal are returned.

The payload is small: five supply names, four cargo ids, one meal title, and optional kcal. The widget reads an app-group cache first and refreshes on a 30-minute timeline, on app foreground, and after a button. Buttons call the existing Live item patch and `POST /cargo/:id/quick-eat` with a new `operationKey` each tap. An in-flight lock ignores a second tap on the same food.

Quick Eat still enforces `cargo-quick-eat` and writes private intake only when that path’s consent rules allow it. The widget always asks for intake; the server skips it when consent is absent. Remaining kcal is computed only after active `goals` and `intake` consent, and the intake sum follows the same kitchen vs cross-kitchen rule as the in-app summary. Lock Screen widgets do not show kcal.

## Auth

The access token stays in memory in the app. The refresh token stays in the app Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`). The widget extension adds the app’s existing keychain access group so it can read that item. The app’s own Keychain calls are unchanged, so current sessions keep working.

Refresh is serialized with a file lock in the app group. Both processes re-read the Keychain inside the lock before rotating, then write the new refresh token back. The widget never deletes the refresh token. Sign-out in the app deletes the widget’s cached access token, deletes the snapshot file, and reloads timelines.

## Tradeoffs

- **Snapshot endpoint vs three existing reads.** One short request fits the widget refresh budget and gives a server kill switch. Mutations stay on existing routes so the in-app Supply check and Quick Eat keep working when the widget flag is off.
- **No household-portion column.** A one-tap “1 g” or “1 dozen” would invent a portion. Those rows open the sheet. Slice size can land later without a widget rewrite.
- **Cache in the app group, tokens in the Keychain.** The snapshot has item names and, when allowed, kcal. It is device-local, excluded from the widget gallery preview (the gallery uses generic placeholder rows), and removed on sign-out.
- **Lock Screen is not tappable for writes.** A check or an eat on the Lock Screen is a mis-tap and a privacy problem. Those controls are Home Screen only.
- **The extension is in the binary.** Flagship cannot remove a widget from the gallery. It can only blank it. That is the correct kill switch without a second App Store build.

## App Store

No new permission prompts, no background modes, no ATS exception, extension API only, no private API, no token or nutrition logging. Privacy manifest on the extension declares no tracking. Grocery names on the Lock Screen are the user’s own list. Nutrition stays off that surface and off the payload without consent.

## Dogfood

Create the flag disabled (production app `4400dc10-dd7a-44b2-9905-7037fbd26f33`, dev `d2623663-dabd-4f7e-87a9-29339ddef4e6`):

```bash
CI=true ./node_modules/.bin/wrangler flagship flags create 4400dc10-dd7a-44b2-9905-7037fbd26f33 ios-home-widgets --type boolean --default-variation off --disabled --description "iOS Home Screen widgets for Supply, Ate, and Today"
```

Enable later for iOS `clientVersion` ≥ `1.5.2` only. Ate one-tap also needs `cargo-quick-eat` (and its nutrition parents) on. Install the widget from the Home Screen gallery after that binary is on the phone, then open Ration once so the timeline reloads.
