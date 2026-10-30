# iOS Home Screen widgets

Ships unflagged in iOS 1.5.x. The `ios-home-widgets` flag was removed before release; delete it from Flagship after the 1.5.x deploy. User guide: `docs/fin/27-ios-home-screen-widgets.md`.

## What ships

One WidgetKit extension (`com.mayutic.ration.widgets`) with three static widgets.

| Widget | Families | Action |
| --- | --- | --- |
| Supply | Small, medium, large, Lock Screen (circular, rectangular, inline) | Unchecked **Live** rows (medium 2, large 5). A row marks that item purchased. It does not dock to Cargo. “+” opens Live with the jot sheet focused so the keyboard (and dictation) can take “butter, eggs, bread”. Lock Screen shows names and a count only and is not tappable. |
| Eat | Small glance, medium (2), large (4) | Count units (unit, piece, slice, can, pack, and the other discrete counts except dozen) eat **1** of that unit via Quick Eat. Grams, millilitres, and dozen open the in-app Quick Eat sheet. Edit Widget can limit the list to one cargo tag. |
| Today | Small, medium, large | Read-only. Today's meals by slot; small shows the next uncooked meal, or “Nothing planned” / “All cooked”. Remaining kcal (and macros on large) only when goals and intake consent are active. |

No Control Center, Live Activity, or Siri intent. Mutation intents are not discoverable in Shortcuts.

## Mechanism

`GET /api/mobile/v1/widgets/home?date=YYYY-MM-DD` is the only new endpoint. The date is the device’s local calendar day. The handler uses `requireMobileActiveGroup` (session org, never a client org id), and rate-limits per user (`widget_snapshot`). A signed-out widget shows “Open Ration to sign in”.

The payload is small: five supply names, four cargo ids, one meal title, and optional kcal. The widget reads an app-group cache first and refreshes on a 60-minute timeline, on app foreground, and after a button. Buttons call the existing Live item patch and `POST /cargo/:id/quick-eat` with a new `operationKey` each tap. An in-flight lock ignores a second tap on the same food.

Quick Eat writes private intake only when that path’s consent rules allow it. The widget always asks for intake; the server skips it when consent is absent. Remaining kcal is computed only after active `goals` and `intake` consent, and the intake sum follows the same kitchen vs cross-kitchen rule as the in-app summary. Lock Screen widgets do not show kcal.

## Auth

The access token stays in memory in the app. The refresh token stays in the app Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`). The widget extension adds the app’s existing keychain access group so it can read that item. The app’s own Keychain calls are unchanged, so current sessions keep working.

Refresh is serialized with a file lock in the app group. Both processes re-read the Keychain inside the lock before rotating, then write the new refresh token back. The widget never deletes the refresh token. Sign-out in the app deletes the widget’s cached access token, deletes the snapshot file, and reloads timelines.

## Tradeoffs

- **Snapshot endpoint vs three existing reads.** One short request fits the widget refresh budget. Mutations stay on existing routes, so the widget and the in-app Supply check and Quick Eat share one write path.
- **No household-portion column.** A one-tap “1 g” or “1 dozen” would invent a portion. Those rows open the sheet. Slice size can land later without a widget rewrite.
- **Cache in the app group, tokens in the Keychain.** The snapshot has item names and, when allowed, kcal. It is device-local, excluded from the widget gallery preview (the gallery uses generic placeholder rows), and removed on sign-out.
- **Lock Screen is not tappable for writes.** A check or an eat on the Lock Screen is a mis-tap and a privacy problem. Those controls are Home Screen only.

## App Store

No new permission prompts, no background modes, no ATS exception, extension API only, no private API, no token or nutrition logging. Privacy manifest on the extension declares no tracking. Grocery names on the Lock Screen are the user’s own list. Nutrition stays off that surface and off the payload without consent.
