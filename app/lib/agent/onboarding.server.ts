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

export function buildGetContextCapabilities(scopes: string[]) {
	const normalizedScopes = scopes as McpScope[];
	const has = (needed: McpScope) =>
		normalizedScopes.includes("mcp") || normalizedScopes.includes(needed);
	return {
		canRead: has("mcp:read"),
		canWriteInventory: has("mcp:inventory:write"),
		canWriteGalley: has("mcp:galley:write"),
		canWriteManifest: has("mcp:manifest:write"),
		canWriteSupply: has("mcp:supply:write"),
		canWritePreferences: has("mcp:preferences:write"),
	};
}
