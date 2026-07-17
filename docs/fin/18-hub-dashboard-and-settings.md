# Hub dashboard and settings

## Hub home

The **hub dashboard** shows configurable **widgets**: inventory stats, cookable meals, partial matches, expiring cargo, supply preview, and manifest preview. You can change **layout presets** and per-widget visibility, size, and filters where the UI allows.

## Main areas

| Area | Purpose |
|------|---------|
| Dashboard | At-a-glance widgets |
| Cargo | Pantry inventory |
| Galley | Recipes and provisions |
| Manifest | Meal plan calendar |
| Supply | Shopping list |
| Pricing | Credits, subscription, checkout return |
| Settings | Account, group, preferences, developer, help, danger |
| New group | Create an organization |

Follow in-app navigation if labels move.

## Settings sections

Open **Hub → Settings**:

- **Account** — Display name, avatar, default group after sign-in.
- **Group** — Active group name/avatar, members, invitations (when tier allows), roles, ownership transfer, credit transfer, org tags, supply planning horizon. See *Groups and membership*.
- **Preferences** — Allergens, unit display mode, and other kitchen preferences shown in the UI.
- **Developer** — Overview path chooser, **MCP** (OAuth connect + grant management), and **API Keys** (REST v1 and advanced MCP scopes). See *API key safety*, *MCP overview*, and *REST API (v1) overview*.
- **Help & Feedback** — Links into the self-serve guide at `/help` (same docs used by Ask Ration). See *Ask Ration vs reading the guide*.
- **Danger Zone** — Delete group (when allowed), and **purge account** (irreversible). Read all warnings. Account purge removes user data and handles owned groups per product rules (transfer or delete). See *Data, privacy, and deletion*.

## Tags

Under **Settings → Group → Tags**, owners and admins create, rename, recolor, categorize, **merge** duplicates, delete unused tags, or run unused cleanup. Tags attach to Cargo and meals for filtering.

## Allergens and units

Set **allergens** and **unit display mode** in Preferences. Allergen settings influence AI suggestions; units control how quantities appear across Cargo, Galley, and Supply.

## Checkout return

After Stripe checkout you may land with **`transaction=success`** so the hub refreshes **tier and credits** without a manual reload.

## Actions (summary)

- Customize hub **widgets** and **presets**.
- Update **Account** profile and **default group**.
- Manage **Group** membership, tags, and owner/admin admin flows.
- Edit **Preferences** (allergens, units).
- Configure **Developer** MCP and API keys.
- Open **Help** (`/help`) or give feedback.
- Run **Danger Zone** purge or group delete only when you intend permanent loss.

If a control is missing, your **tier or role** may not allow it—see *Free vs Crew Member*.
