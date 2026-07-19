import { ref, zodOpenApiComponent } from "~/lib/openapi/json-schema";
import {
	CopilotMessageSchema,
	CopilotStatusResponseSchema,
	CopilotStreamEventSchema,
} from "~/lib/schemas/copilot";
import { APP_VERSION } from "~/lib/version";

/** OpenAPI 3.1 document for the mobile REST API (`/api/mobile/v1/*`). */
export function buildMobileOpenApiDocument(baseUrl: string) {
	const server = baseUrl.replace(/\/$/, "");
	return {
		openapi: "3.1.0",
		info: {
			title: "Ration Mobile API",
			version: APP_VERSION,
			description:
				"Bearer-authenticated REST API for the Ration iOS app. Web hub APIs remain cookie-session under /api/*.",
		},
		servers: [{ url: server }],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
				},
			},
			schemas: {
				ApiError: {
					type: "object",
					properties: {
						error: { type: "string" },
						code: { type: "string" },
					},
					required: ["error"],
				},
				TokenPair: {
					type: "object",
					properties: {
						accessToken: { type: "string" },
						refreshToken: { type: "string" },
						expiresIn: { type: "integer" },
					},
					required: ["accessToken", "refreshToken", "expiresIn"],
				},
				MobileBillingStatus: {
					type: "object",
					properties: {
						tier: { type: "string", example: "crew_member" },
						credits: { type: "integer" },
						entitlements: {
							type: "object",
							properties: {
								crew_member: {
									type: "object",
									properties: {
										active: { type: "boolean" },
										expiresAt: { type: "string", nullable: true },
										store: { type: "string", nullable: true },
									},
									required: ["active", "expiresAt", "store"],
								},
							},
							required: ["crew_member"],
						},
						management: {
							type: "object",
							properties: {
								store: { type: "string", nullable: true },
								url: { type: "string", nullable: true },
							},
							required: ["store", "url"],
						},
						canPurchaseSubscription: { type: "boolean" },
						purchaseBlockReason: { type: "string", nullable: true },
						billingUnavailable: { type: "boolean" },
					},
					required: [
						"tier",
						"credits",
						"entitlements",
						"management",
						"canPurchaseSubscription",
						"purchaseBlockReason",
						"billingUnavailable",
					],
				},
				CopilotMessage: zodOpenApiComponent(
					"CopilotMessage",
					CopilotMessageSchema,
				),
				CopilotStreamEvent: zodOpenApiComponent(
					"CopilotStreamEvent",
					CopilotStreamEventSchema,
				),
				CopilotStatusResponse: zodOpenApiComponent(
					"CopilotStatusResponse",
					CopilotStatusResponseSchema,
				),
			},
		},
		paths: {
			"/api/mobile/v1/auth/magic-link": {
				post: {
					summary: "Request magic link email",
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										email: { type: "string", format: "email" },
										codeChallenge: {
											type: "string",
											description:
												"PKCE S256 challenge (base64url, 43-128 chars). Proven via codeVerifier at token exchange.",
										},
									},
									required: ["email", "codeChallenge"],
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Email dispatched",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: { sent: { type: "boolean" } },
									},
								},
							},
						},
					},
				},
			},
			"/api/mobile/v1/auth/review-login": {
				post: {
					summary: "App Review demo email+password login",
					description:
						"Flagship-gated (`app-review-login`). Authenticates the single pre-seeded review account using Worker secrets. Returns the same TokenPair as social/magic-link.",
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										email: { type: "string", format: "email" },
										password: { type: "string" },
										tosAccepted: { type: "boolean", const: true },
									},
									required: ["email", "password", "tosAccepted"],
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Token pair",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/TokenPair" },
								},
							},
						},
						"403": {
							description: "Feature disabled",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/mobile/v1/client-flags": {
				get: {
					summary: "Client-visible feature flags (unsigned)",
					description:
						"Returns Flagship clientVisible flags for signed-out surfaces such as Sign In. Authenticated clients may use GET /session instead.",
					responses: {
						"200": {
							description: "clientFlags map",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											clientFlags: {
												type: "object",
												additionalProperties: { type: "boolean" },
											},
										},
										required: ["clientFlags"],
									},
								},
							},
						},
					},
				},
			},
			"/api/mobile/v1/auth/token": {
				post: {
					summary: "Exchange authorization code or refresh token",
					description:
						"authorization_code grant requires codeVerifier (PKCE). refresh_token grant requires refreshToken.",
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										grantType: {
											type: "string",
											enum: ["authorization_code", "refresh_token"],
										},
										code: { type: "string" },
										codeVerifier: {
											type: "string",
											description:
												"PKCE verifier (base64url, 43-128 chars) matching the codeChallenge from magic-link.",
										},
										refreshToken: { type: "string" },
									},
									required: ["grantType"],
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Token pair",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/TokenPair" },
								},
							},
						},
					},
				},
			},
			"/api/mobile/v1/session": {
				get: {
					summary: "Current user, org, credits, tier",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Session payload" } },
				},
			},
			"/api/mobile/v1/hub": {
				get: {
					summary: "Hub widget grid data and resolved layout",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Hub payload" } },
				},
			},
			"/api/mobile/v1/cargo": {
				get: {
					summary: "Paginated cargo list",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Cargo page" } },
				},
				post: {
					summary: "Create cargo item",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Created item" } },
				},
			},
			"/api/mobile/v1/scan": {
				post: {
					summary: "Upload receipt image for AI scan",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Processing status" } },
				},
			},
			"/api/mobile/v1/supply": {
				get: {
					summary: "Active supply list with items",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Supply list" } },
				},
			},
			"/api/mobile/v1/copilot/status": {
				get: {
					summary: "Copilot allowance and credit status",
					description:
						"Returns the per-conversation copilot allowance, credit balance, auto-deduct consent, idle timeout, and linear token pricing for the active organization.",
					security: [{ bearerAuth: [] }],
					responses: {
						"200": {
							description: "Copilot status",
							content: {
								"application/json": {
									schema: ref("CopilotStatusResponse"),
								},
							},
						},
						"401": {
							description: "Unauthorized",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/mobile/v1/copilot/consent": {
				post: {
					summary: "Update Copilot credit auto-deduct consent",
					description:
						"Stores whether the active user allows Copilot to use the active organization's credit balance after the Crew daily allowance is exhausted.",
					security: [{ bearerAuth: [] }],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["autoDeductConsent"],
									properties: {
										autoDeductConsent: { type: "boolean" },
									},
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Updated Copilot status",
							content: {
								"application/json": {
									schema: ref("CopilotStatusResponse"),
								},
							},
						},
						"401": {
							description: "Unauthorized",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/mobile/v1/billing/status": {
				get: {
					summary: "Entitlements, purchase eligibility, and credits",
					description:
						"Reads RevenueCat subscriber state when configured. Uses D1 tier as fallback. Returns billingUnavailable=true when RevenueCat cannot be reached.",
					security: [{ bearerAuth: [] }],
					responses: {
						"200": {
							description: "Billing status",
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/MobileBillingStatus",
									},
								},
							},
						},
						"401": {
							description: "Unauthorized",
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/ApiError" },
								},
							},
						},
					},
				},
			},
			"/api/mobile/v1/settings": {
				get: {
					summary: "User settings (theme, units, allergens, privacy)",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Settings payload" } },
				},
				patch: {
					summary: "Patch user settings",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Updated settings" } },
				},
			},
			"/api/mobile/v1/account": {
				delete: {
					summary: "Permanently delete the authenticated user account",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Account deleted" } },
				},
			},
			"/api/mobile/v1/manifest": {
				get: {
					summary: "Meal plan entries for a date range",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Manifest week" } },
				},
				post: {
					summary: "Add a meal plan entry",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Created entry" } },
				},
			},
			"/api/mobile/v1/manifest/consume": {
				post: {
					summary: "Mark manifest entries as consumed",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Consume result" } },
				},
			},
			"/api/mobile/v1/cargo/batch": {
				post: {
					summary: "Batch add cargo items (scan confirm)",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Batch ingest summary" } },
				},
			},
			"/api/mobile/v1/organization/supply-settings": {
				get: {
					summary: "Org supply planning horizon (read)",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Supply settings and window" } },
				},
				patch: {
					summary: "Update org supply planning horizon (owner/admin)",
					security: [{ bearerAuth: [] }],
					responses: {
						"200": { description: "Updated supply settings" },
						"403": { description: "Forbidden for members" },
					},
				},
			},
			"/api/mobile/v1/supply/sync": {
				post: {
					summary: "Rebuild supply list from selected meals",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Synced supply list" } },
				},
			},
			"/api/mobile/v1/supply/complete": {
				post: {
					summary: "Dock purchased supply items into cargo",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Dock result" } },
				},
			},
		},
	};
}
