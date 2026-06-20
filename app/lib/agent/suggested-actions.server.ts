import type { AgentKitchenSnapshot } from "./kitchen-snapshot.server";
import type {
	AgentOnboardingState,
	SuggestedNextAction,
} from "./onboarding.server";

export function buildKitchenAwareSuggestedActions(
	onboarding: AgentOnboardingState,
	capabilities: Record<string, boolean>,
	kitchen: AgentKitchenSnapshot,
): SuggestedNextAction[] {
	const actions: SuggestedNextAction[] = [];

	if (!onboarding.claimed) {
		actions.push({
			action: "claim_kitchen",
			description:
				"Share the one-time claim URL returned during registration, or open the claim page and paste the claim token.",
		});
		if (onboarding.preClaim) {
			actions.push({
				action: "reissue_claim_url",
				description:
					"If the human lost the claim link, call POST /api/agent/auth/claim/reissue with Authorization: Bearer <agent-api-key> to receive a new claim_url.",
			});
		}
	}

	if (kitchen.capacity.cargo.current === 0 && capabilities.canWriteInventory) {
		actions.push({
			action: "seed_inventory",
			description:
				"Cargo is empty — call add_cargo_item or preview_inventory_import → apply_inventory_import to seed the pantry.",
		});
	} else if (
		capabilities.canWriteInventory &&
		kitchen.capacity.cargo.canAdd === 0 &&
		kitchen.capacity.cargo.limit !== -1
	) {
		actions.push({
			action: "cargo_at_limit",
			description: `Cargo is at the ${kitchen.tier} tier cap (${kitchen.capacity.cargo.limit} items). Claim ownership or upgrade to Crew Member for unlimited inventory.`,
		});
	} else if (capabilities.canWriteInventory) {
		actions.push({
			action: "add_cargo_item",
			description: "Add or update Cargo inventory items.",
		});
	}

	if (kitchen.capacity.cargo.current > 0 && capabilities.canRead) {
		actions.push({
			action: "search_ingredients",
			description:
				"Pantry has items — try search_ingredients or match_meals to plan from stock.",
		});
		actions.push({
			action: "get_expiring_items",
			description:
				"Check get_expiring_items to prioritize items before they spoil.",
		});
	}

	if (kitchen.capacity.meals.current === 0 && capabilities.canWriteGalley) {
		actions.push({
			action: "create_meal",
			description:
				"Galley is empty — create_meal or import recipes via REST v1 galley/import.",
		});
	} else if (capabilities.canWriteGalley) {
		actions.push({
			action: "list_meals",
			description: "Browse Galley meals and match against pantry stock.",
		});
	}

	if (capabilities.canWriteManifest && kitchen.capacity.cargo.current > 0) {
		actions.push({
			action: "get_meal_plan",
			description:
				"Inspect Manifest with get_meal_plan or bulk_add_meal_plan_entries after matching meals.",
		});
	}

	if (capabilities.canWriteSupply) {
		actions.push({
			action: "sync_supply_from_selected_meals",
			description:
				"Build a Supply shopping list from selected meals and missing Cargo.",
		});
	}

	if (kitchen.credits === 0) {
		actions.push({
			action: "credits_depleted",
			description:
				"Credit balance is 0 — Ration UI AI features (scan, meal generate, plan week) require credits; MCP tools remain free.",
		});
	}

	if (kitchen.lastActivityAt === null && kitchen.capacity.cargo.current === 0) {
		actions.push({
			action: "bootstrap_kitchen",
			description:
				"New kitchen — start with inventory import, then match_meals and sync_supply_from_selected_meals.",
		});
	}

	return actions;
}
