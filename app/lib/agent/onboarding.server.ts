import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import type { McpScope } from "../mcp/scopes";

export interface AgentOnboardingState {
	claimed: boolean;
	status: "pending_claim" | "claimed" | "none";
	claimPage?: string;
	claimUrlAvailable: boolean;
	preClaim: boolean;
}

export interface SuggestedNextAction {
	action: string;
	description: string;
}

export function buildSuggestedNextActions(
	onboarding: AgentOnboardingState,
	capabilities: Record<string, boolean>,
): SuggestedNextAction[] {
	const actions: SuggestedNextAction[] = [];

	if (!onboarding.claimed) {
		actions.push({
			action: "claim_kitchen",
			description:
				"Share the one-time claim URL returned during registration, or open the claim page and paste the claim token.",
		});
	}

	if (capabilities.canRead) {
		actions.push({
			action: "get_context",
			description:
				"You already have context — try search_ingredients or list_inventory.",
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
		...(claimed ? {} : { claimPage: `${origin}/connect/claim` }),
	};
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
