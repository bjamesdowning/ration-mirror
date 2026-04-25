import { useEffect } from "react";

type WebMcpTool = {
	name: string;
	description: string;
	inputSchema: {
		type: "object";
		properties: Record<string, unknown>;
		additionalProperties: boolean;
	};
	execute: () => Promise<unknown>;
};

type ModelContext = {
	provideContext: (context: { tools: WebMcpTool[] }) => void;
};

declare global {
	interface Navigator {
		modelContext?: ModelContext;
	}
}

export function WebMcpProvider() {
	useEffect(() => {
		const context = navigator.modelContext;
		if (!context || typeof context.provideContext !== "function") return;

		context.provideContext({
			tools: [
				{
					name: "ration_open_signup",
					description: "Navigate to the Ration signup section.",
					inputSchema: {
						type: "object",
						properties: {},
						additionalProperties: false,
					},
					execute: async () => {
						window.location.href = "/#signup";
						return { ok: true };
					},
				},
				{
					name: "ration_open_pricing",
					description: "Navigate to Ration pricing and credit information.",
					inputSchema: {
						type: "object",
						properties: {},
						additionalProperties: false,
					},
					execute: async () => {
						window.location.href = "/#pricing";
						return { ok: true };
					},
				},
				{
					name: "ration_get_agent_discovery",
					description: "Return public Ration agent discovery endpoints.",
					inputSchema: {
						type: "object",
						properties: {},
						additionalProperties: false,
					},
					execute: async () => ({
						apiCatalog: "/.well-known/api-catalog",
						mcpServerCard: "/.well-known/mcp/server-card.json",
						agentSkills: "/.well-known/agent-skills/index.json",
						apiDocs: "/docs/api",
						mcpEndpoint: "https://mcp.ration.mayutic.com/mcp",
					}),
				},
			],
		});
	}, []);

	return null;
}
