import type { ConnectedAgentGrant } from "~/lib/oauth.server";

export type DeveloperSubTab = "overview" | "mcp" | "api-keys";

export type ApiKeyRow = {
	id: string;
	keyPrefix: string;
	name: string;
	scopes: string;
	lastUsedAt: Date | null;
	createdAt: Date;
};

export type AgentKitchenRow = {
	id: string;
	status: "pending_claim" | "claimed";
	preClaim: boolean;
	claimedAt: Date | null;
	createdAt: Date;
	clientHint: string | null;
	apiKeyId: string;
};

export type DeveloperSectionProps = {
	apiKeys: ApiKeyRow[];
	connectedAgents: ConnectedAgentGrant[];
	agentKitchens: AgentKitchenRow[];
	organizationName: string;
	origin: string;
};
