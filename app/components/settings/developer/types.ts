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

export type DeveloperSectionProps = {
	apiKeys: ApiKeyRow[];
	connectedAgents: ConnectedAgentGrant[];
	organizationName: string;
	origin: string;
};
