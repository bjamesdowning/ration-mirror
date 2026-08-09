import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import type { McpScope } from "../mcp/scopes";
import { buildClaimRecoveryPaths } from "./claim.constants";

import type { AgentKitchenSnapshot } from "./kitchen-snapshot.server";
import { buildKitchenAwareSuggestedActions } from "./suggested-actions.server";

export interface AgentOnboardingState {
	claimed: boolean;
	status: "pending_claim" | "claimed" | "none";
	claimPage?: string;
	claimUrlAvailable: boolean;
	preClaim: boolean;
	claimRequiredForOwnership?: boolean;
	reissueClaimUri?: string;
}

export interface SuggestedNextAction {
	action: string;
	description: string;
}

export { buildClaimRecoveryPaths } from "./claim.constants";

export function buildSuggestedNextActions(
	onboarding: AgentOnboardingState,
	capabilities: Record<string, boolean>,
	kitchen?: AgentKitchenSnapshot,
): SuggestedNextAction[] {
	if (kitchen) {
		return buildKitchenAwareSuggestedActions(onboarding, capabilities, kitchen);
	}

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

	if (capabilities.canRead) {
		actions.push({
			action: "search_ingredients",
			description: "Try search_ingredients or list_inventory.",
		});
	}

	if (!onboarding.claimed && capabilities.canWriteInventory) {
		actions.push({
			action: "add_cargo_item",
			description: "Add items to Cargo inventory.",
		});
	}

	if (!onboarding.claimed && capabilities.canWriteGalley) {
		actions.push({
			action: "list_meals",
			description: "Browse Galley meals and match against pantry stock.",
		});
	}

	if (onboarding.claimed && capabilities.canWriteInventory) {
		actions.push({
			action: "add_cargo_item",
			description: "Add items to Cargo inventory.",
		});
	}

	if (onboarding.claimed && capabilities.canWriteGalley) {
		actions.push({
			action: "list_meals",
			description: "Browse Galley meals and match against pantry stock.",
		});
	}

	return actions;
}

export async function getAgentOnboardingState(
	env: Cloudflare.Env,
	organizationId: string,
	origin: string,
): Promise<AgentOnboardingState> {
	const db = drizzle(env.DB, { schema });
	const registration = await db.query.agentRegistration.findFirst({
		where: eq(schema.agentRegistration.organizationId, organizationId),
		columns: {
			status: true,
			preClaim: true,
			claimTokenHash: true,
		},
	});

	const recovery = buildClaimRecoveryPaths(origin);

	if (!registration) {
		return {
			claimed: true,
			status: "none",
			preClaim: false,
			claimUrlAvailable: false,
		};
	}

	const claimed = registration.status === "claimed";
	return {
		claimed,
		status: registration.status,
		preClaim: registration.preClaim,
		claimUrlAvailable: false,
		...(claimed
			? {}
			: {
					claimPage: recovery.claimPage,
					reissueClaimUri: recovery.reissueClaimUri,
					claimRequiredForOwnership: true,
				}),
	};
}

export async function resolvePreClaimForOrg(
	env: Cloudflare.Env,
	organizationId: string,
): Promise<boolean> {
	const db = drizzle(env.DB, { schema });
	const registration = await db.query.agentRegistration.findFirst({
		where: eq(schema.agentRegistration.organizationId, organizationId),
		columns: { preClaim: true, status: true },
	});
	if (!registration) return false;
	return registration.status === "pending_claim" && registration.preClaim;
}

export type NutritionCapabilityFlags = {
	engine: boolean;
	manifest: boolean;
	goals: boolean;
	cookLogSplit?: boolean;
};

export function buildGetContextCapabilities(
	scopes: string[],
	nutrition?: NutritionCapabilityFlags,
) {
	const normalizedScopes = scopes as McpScope[];
	const has = (needed: McpScope) =>
		normalizedScopes.includes("mcp") || normalizedScopes.includes(needed);
	const canRead = has("mcp:read");
	const canWritePreferences = has("mcp:preferences:write");
	const canNutritionRead = has("mcp:nutrition:read");
	const canNutritionWrite = has("mcp:nutrition:write");
	const canWriteManifest = has("mcp:manifest:write");
	const canWriteInventory = has("mcp:inventory:write");
	const engine = nutrition?.engine ?? false;
	const manifest = nutrition?.manifest ?? false;
	const goals = nutrition?.goals ?? false;
	const cookLogSplit = nutrition?.cookLogSplit ?? false;
	return {
		canRead,
		canWriteInventory,
		canWriteGalley: has("mcp:galley:write"),
		canWriteManifest,
		canWriteSupply: has("mcp:supply:write"),
		canWritePreferences,
		/** USDA resolve + cargo/meal nutrition snapshots (nutrition-engine). */
		nutritionEngine: engine && canNutritionRead,
		/** Manifest Eat → intake logging (nutrition-manifest). */
		nutritionManifest: manifest && canNutritionRead,
		/** Personal goals + summary vs goal (nutrition-goals). */
		nutritionGoals: goals && canNutritionRead,
		/** Cook ≠ Eat split (nutrition-cook-log-split). */
		nutritionCookLogSplit: cookLogSplit && canRead,
		/** cook_manifest_entries when split is on. */
		canCookManifest: cookLogSplit && canWriteManifest && canWriteInventory,
		/** log/clear_manifest_intake when split + manifest are on. */
		canLogPersonalIntake: cookLogSplit && manifest && canNutritionWrite,
		/** set/clear nutrition goal tools. */
		canWriteNutritionGoals: goals && canNutritionWrite,
	};
}

/** Human-readable notes for get_context when nutrition flags are on. */
export function buildNutritionCapabilityNotes(
	flags: NutritionCapabilityFlags,
): string[] {
	const notes: string[] = [];
	if (flags.engine) {
		notes.push(
			"nutrition-engine: Cargo/meal nutrition snapshots; USDA auto-resolve on add when override omitted.",
		);
	}
	if (flags.cookLogSplit) {
		notes.push(
			"nutrition-cook-log-split: Cook with cook_manifest_entries or consume_meal (Galley bridge) — never logs personal intake. Eat separately with log_manifest_intake after consent. consume_manifest_entries is refused while split is on.",
		);
	}
	if (flags.manifest) {
		notes.push(
			flags.cookLogSplit
				? "nutrition-manifest: log_manifest_intake / clear_manifest_intake for private plate-up; list_nutrition_intakes + get_nutrition_summary for history."
				: "nutrition-manifest: legacy consume_manifest_entries may log intake only when logNutrition:true (opt-in for agents).",
		);
	}
	if (flags.goals) {
		notes.push(
			"nutrition-goals: get_nutrition_summary, list_nutrition_intakes, and set/clear_nutrition_goal (not medical advice).",
		);
	}
	return notes;
}
