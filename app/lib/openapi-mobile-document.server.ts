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
			"/api/mobile/v1/dashboard": {
				get: {
					summary: "Hub dashboard aggregates",
					security: [{ bearerAuth: [] }],
					responses: { "200": { description: "Dashboard" } },
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
		},
	};
}
