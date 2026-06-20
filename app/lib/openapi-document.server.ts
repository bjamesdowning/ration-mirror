import { AGENT_CLAIM_REISSUE_PATH } from "./agent/claim.constants";
import { MCP_TOOL_GROUPS } from "./agent-readiness";
import { ref, zodOpenApiComponent } from "./openapi/json-schema";
import {
	agentAnonRegisterSchema,
	agentClaimCompleteSchema,
	agentClaimStartSchema,
} from "./schemas/agent-auth";
import { CargoCsvRowSchema } from "./schemas/api-import";
import { GalleyManifestSchema } from "./schemas/galley-manifest";
import {
	AgentAnonRegisterResponseSchema,
	AgentClaimCompleteResponseSchema,
	AgentClaimReissueResponseSchema,
	AgentClaimStartResponseSchema,
	ApiErrorSchema,
	V1ImportSuccessSchema,
} from "./schemas/openapi-responses";
import { APP_VERSION } from "./version";

const COMPONENT_NAMES = {
	AgentAnonRegisterRequest: "AgentAnonRegisterRequest",
	AgentAnonRegisterResponse: "AgentAnonRegisterResponse",
	AgentClaimStartRequest: "AgentClaimStartRequest",
	AgentClaimStartResponse: "AgentClaimStartResponse",
	AgentClaimCompleteRequest: "AgentClaimCompleteRequest",
	AgentClaimCompleteResponse: "AgentClaimCompleteResponse",
	AgentClaimReissueResponse: "AgentClaimReissueResponse",
	GalleyManifest: "GalleyManifest",
	CargoCsvRow: "CargoCsvRow",
	V1ImportSuccess: "V1ImportSuccess",
	ApiError: "ApiError",
} as const;

function buildComponents() {
	return {
		schemas: {
			[COMPONENT_NAMES.AgentAnonRegisterRequest]: zodOpenApiComponent(
				COMPONENT_NAMES.AgentAnonRegisterRequest,
				agentAnonRegisterSchema,
			),
			[COMPONENT_NAMES.AgentAnonRegisterResponse]: zodOpenApiComponent(
				COMPONENT_NAMES.AgentAnonRegisterResponse,
				AgentAnonRegisterResponseSchema,
			),
			[COMPONENT_NAMES.AgentClaimStartRequest]: zodOpenApiComponent(
				COMPONENT_NAMES.AgentClaimStartRequest,
				agentClaimStartSchema,
			),
			[COMPONENT_NAMES.AgentClaimStartResponse]: zodOpenApiComponent(
				COMPONENT_NAMES.AgentClaimStartResponse,
				AgentClaimStartResponseSchema,
			),
			[COMPONENT_NAMES.AgentClaimCompleteRequest]: zodOpenApiComponent(
				COMPONENT_NAMES.AgentClaimCompleteRequest,
				agentClaimCompleteSchema,
			),
			[COMPONENT_NAMES.AgentClaimCompleteResponse]: zodOpenApiComponent(
				COMPONENT_NAMES.AgentClaimCompleteResponse,
				AgentClaimCompleteResponseSchema,
			),
			[COMPONENT_NAMES.AgentClaimReissueResponse]: zodOpenApiComponent(
				COMPONENT_NAMES.AgentClaimReissueResponse,
				AgentClaimReissueResponseSchema,
			),
			[COMPONENT_NAMES.GalleyManifest]: zodOpenApiComponent(
				COMPONENT_NAMES.GalleyManifest,
				GalleyManifestSchema,
			),
			[COMPONENT_NAMES.CargoCsvRow]: zodOpenApiComponent(
				COMPONENT_NAMES.CargoCsvRow,
				CargoCsvRowSchema,
			),
			[COMPONENT_NAMES.V1ImportSuccess]: zodOpenApiComponent(
				COMPONENT_NAMES.V1ImportSuccess,
				V1ImportSuccessSchema,
			),
			[COMPONENT_NAMES.ApiError]: zodOpenApiComponent(
				COMPONENT_NAMES.ApiError,
				ApiErrorSchema,
			),
		},
	};
}

function jsonResponse(schemaRef: ReturnType<typeof ref>, description: string) {
	return {
		description,
		content: {
			"application/json": {
				schema: schemaRef,
			},
		},
	};
}

function errorResponses(extra: Record<number, { description: string }> = {}) {
	return {
		"400": jsonResponse(
			ref(COMPONENT_NAMES.ApiError),
			"Validation or bad request",
		),
		"429": jsonResponse(ref(COMPONENT_NAMES.ApiError), "Rate limit exceeded"),
		...Object.fromEntries(
			Object.entries(extra).map(([code, { description }]) => [
				code,
				jsonResponse(ref(COMPONENT_NAMES.ApiError), description),
			]),
		),
	};
}

/** Count MCP tools advertised in discovery metadata. */
export function countMcpTools(): number {
	return MCP_TOOL_GROUPS.reduce(
		(total, group) => total + group.tools.length,
		0,
	);
}

export function buildOpenApiDocument(request: Request) {
	const origin = new URL(request.url).origin;
	const mcpToolCount = countMcpTools();

	return {
		openapi: "3.1.0",
		info: {
			title: "Ration API",
			version: APP_VERSION,
			description:
				"Programmatic access to Ration kitchens: agent-first registration (no human signup required), REST v1 import/export, and OAuth MCP with " +
				`${mcpToolCount} tools. See /auth.md and /docs/api for discovery.`,
		},
		servers: [{ url: origin }],
		tags: [
			{
				name: "Agent Auth",
				description: "Agent-first onboarding and claim flows",
			},
			{ name: "REST v1", description: "Scoped API key import/export" },
		],
		components: {
			securitySchemes: {
				apiKey: {
					type: "apiKey",
					in: "header",
					name: "X-Api-Key",
					description:
						"Organization-scoped API key. Scopes: inventory, galley, supply, or mcp:*.",
				},
				bearerApiKey: {
					type: "http",
					scheme: "bearer",
					description:
						"Agent API key as Bearer token (used for claim reissue and MCP).",
				},
			},
			...buildComponents(),
		},
		paths: {
			"/api/agent/auth": {
				post: {
					tags: ["Agent Auth"],
					summary: "Anonymous agent registration",
					description:
						"Provision a new agent kitchen without human signup. Returns a one-time API key, claim URL, and MCP endpoint. Rate limit: 5/min per IP.",
					security: [],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: ref(COMPONENT_NAMES.AgentAnonRegisterRequest),
							},
						},
					},
					responses: {
						"200": jsonResponse(
							ref(COMPONENT_NAMES.AgentAnonRegisterResponse),
							"Registration successful — store api_key immediately",
						),
						...errorResponses(),
					},
				},
			},
			"/api/agent/auth/claim": {
				post: {
					tags: ["Agent Auth"],
					summary: "Start human claim (send OTP email)",
					description:
						"Sends a 6-digit OTP to the provided email when claim_token is valid. Always returns ok:true for invalid tokens (anti-enumeration). Rate limit: 10/min per IP.",
					security: [],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: ref(COMPONENT_NAMES.AgentClaimStartRequest),
							},
						},
					},
					responses: {
						"200": jsonResponse(
							ref(COMPONENT_NAMES.AgentClaimStartResponse),
							"OTP dispatch acknowledged",
						),
						...errorResponses(),
					},
				},
			},
			"/api/agent/auth/claim/complete": {
				post: {
					tags: ["Agent Auth"],
					summary: "Complete human claim with OTP",
					description:
						"Verify OTP and transfer agent kitchen ownership to the human email. Merges into an existing account when the email already has a Ration user.",
					security: [],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: ref(COMPONENT_NAMES.AgentClaimCompleteRequest),
							},
						},
					},
					responses: {
						"200": jsonResponse(
							ref(COMPONENT_NAMES.AgentClaimCompleteResponse),
							"Claim complete",
						),
						...errorResponses({ 400: { description: "Invalid token or OTP" } }),
					},
				},
			},
			[AGENT_CLAIM_REISSUE_PATH]: {
				post: {
					tags: ["Agent Auth"],
					summary: "Reissue claim URL for agent API key",
					description:
						"Returns a fresh claim_token and claim_url when the human lost the original link. Requires the agent's API key. Rate limit: 3/hr per key.",
					security: [{ bearerApiKey: [] }, { apiKey: [] }],
					responses: {
						"200": jsonResponse(
							ref(COMPONENT_NAMES.AgentClaimReissueResponse),
							"New claim URL issued",
						),
						...errorResponses({
							401: { description: "Missing or invalid API key" },
							403: {
								description: "Kitchen already claimed or reissue not allowed",
							},
						}),
					},
				},
			},
			"/api/v1/inventory/export": {
				get: {
					tags: ["REST v1"],
					summary: "Export Cargo inventory as CSV",
					description:
						"Requires inventory scope. Rate limit: 30/min per API key.",
					security: [{ apiKey: [] }],
					responses: {
						"200": {
							description: "CSV inventory export",
							content: {
								"text/csv": {
									schema: { type: "string", format: "binary" },
								},
							},
						},
						...errorResponses({
							401: { description: "Missing scope or invalid key" },
						}),
					},
				},
			},
			"/api/v1/inventory/import": {
				post: {
					tags: ["REST v1"],
					summary: "Import Cargo inventory from CSV",
					description:
						"Requires inventory scope. Body is raw CSV (max 1 MB, max 500 rows). Row shape matches CargoCsvRow. Rate limit: 20/min per API key.",
					security: [{ apiKey: [] }],
					requestBody: {
						required: true,
						content: {
							"text/csv": {
								schema: {
									type: "string",
									description:
										"CSV with header row. Columns: name, quantity, unit, domain, tags, expiresAt.",
								},
							},
							"text/plain": {
								schema: { type: "string" },
							},
						},
					},
					responses: {
						"200": jsonResponse(
							ref(COMPONENT_NAMES.V1ImportSuccess),
							"Import result",
						),
						...errorResponses({
							401: { description: "Missing scope or invalid key" },
							413: { description: "Body exceeds 1 MB" },
						}),
					},
				},
			},
			"/api/v1/galley/export": {
				get: {
					tags: ["REST v1"],
					summary: "Export Galley meals as JSON",
					description:
						"Requires galley scope. Returns GalleyManifest JSON. Rate limit: 30/min per API key.",
					security: [{ apiKey: [] }],
					responses: {
						"200": jsonResponse(
							ref(COMPONENT_NAMES.GalleyManifest),
							"Galley manifest JSON",
						),
						...errorResponses({
							401: { description: "Missing scope or invalid key" },
						}),
					},
				},
			},
			"/api/v1/galley/import": {
				post: {
					tags: ["REST v1"],
					summary: "Import Galley meals from JSON",
					description:
						"Requires galley scope. Body must match GalleyManifest (max 1 MB). Rate limit: 20/min per API key.",
					security: [{ apiKey: [] }],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: ref(COMPONENT_NAMES.GalleyManifest),
							},
						},
					},
					responses: {
						"200": jsonResponse(
							ref(COMPONENT_NAMES.V1ImportSuccess),
							"Import result",
						),
						...errorResponses({
							401: { description: "Missing scope or invalid key" },
							413: { description: "Body exceeds 1 MB" },
						}),
					},
				},
			},
			"/api/v1/supply/export": {
				get: {
					tags: ["REST v1"],
					summary: "Export active Supply list as CSV",
					description: "Requires supply scope. Rate limit: 30/min per API key.",
					security: [{ apiKey: [] }],
					responses: {
						"200": {
							description: "CSV supply list export",
							content: {
								"text/csv": {
									schema: { type: "string", format: "binary" },
								},
							},
						},
						"404": jsonResponse(
							ref(COMPONENT_NAMES.ApiError),
							"No supply list found",
						),
						...errorResponses({
							401: { description: "Missing scope or invalid key" },
						}),
					},
				},
			},
		},
	};
}

/** Guard for tests — every registered component name resolves in the document. */
export function openApiComponentNames(): string[] {
	return Object.values(COMPONENT_NAMES);
}
