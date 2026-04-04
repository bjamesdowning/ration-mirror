# Hub dashboard and settings

## Hub home (`/hub`)

The **hub dashboard** shows configurable **widgets**: inventory stats, cookable meals, partial matches, expiring cargo, supply preview, and manifest preview. You can change layout presets and widget options where the UI allows.

## Main areas

| Area | Typical path | Purpose |
|------|----------------|---------|
| Dashboard | `/hub` | At-a-glance widgets |
| Settings | `/hub/settings` | Profile, group, API keys, danger zone |
| Pricing | `/hub/pricing` | Credits, subscription, checkout return |
| Cargo | `/hub/cargo` | Pantry |
| Galley | `/hub/galley` | Recipes and provisions |
| Supply | `/hub/supply` | Shopping list |
| Manifest | `/hub/manifest` | Meal plan calendar |
| New group | `/hub/groups/new` | Create an organization |

Paths match the live app routing; if URLs change, follow navigation inside the product.

## Settings highlights

- **Display name and avatar**
- **Allergens and units** (where shown)
- **API keys** for REST and MCP—see *API key safety* and *MCP overview*
- **Group management**: roles, invitations (when tier allows), ownership transfer, credit transfer (owner-only flows as labeled)
- **Billing portal** link when available from pricing or settings actions
- **Purge account** (irreversible)—read warnings carefully

## Checkout return

After Stripe checkout you may land on a URL with **`transaction=success`** so the hub refreshes **tier and credits** without a manual reload.

If a control is missing, your **tier or role** may not allow it—see *Subscription tiers*.
