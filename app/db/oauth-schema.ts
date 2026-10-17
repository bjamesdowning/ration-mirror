/**
 * Better Auth OAuth Provider + JWT plugin tables.
 * Table names match Better Auth model names (camelCase).
 */
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Forward-declared table refs — imported at runtime via auth adapter only.
// Avoid importing ./schema here to prevent circular dependencies.

export const jwks = sqliteTable("jwks", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp" }),
	alg: text("alg"),
	crv: text("crv"),
});

export const oauthClient = sqliteTable(
	"oauthClient",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		clientId: text("client_id").notNull().unique(),
		clientSecret: text("client_secret"),
		disabled: integer("disabled", { mode: "boolean" }).default(false),
		skipConsent: integer("skip_consent", { mode: "boolean" }),
		enableEndSession: integer("enable_end_session", { mode: "boolean" }),
		subjectType: text("subject_type"),
		scopes: text("scopes", { mode: "json" }).$type<string[]>(),
		clientCredentialsScopes: text("client_credentials_scopes", {
			mode: "json",
		}).$type<string[]>(),
		clientDiscoveryId: text("client_discovery_id"),
		userId: text("user_id"),
		referenceId: text("reference_id"),
		createdAt: integer("created_at", { mode: "timestamp" }),
		updatedAt: integer("updated_at", { mode: "timestamp" }),
		name: text("name"),
		uri: text("uri"),
		icon: text("icon"),
		contacts: text("contacts", { mode: "json" }).$type<string[]>(),
		tos: text("tos"),
		policy: text("policy"),
		softwareId: text("software_id"),
		softwareVersion: text("software_version"),
		softwareStatement: text("software_statement"),
		redirectUris: text("redirect_uris", { mode: "json" })
			.notNull()
			.$type<string[]>(),
		postLogoutRedirectUris: text("post_logout_redirect_uris", {
			mode: "json",
		}).$type<string[]>(),
		tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
		applicationType: text("application_type"),
		backchannelLogoutUri: text("backchannel_logout_uri"),
		backchannelLogoutSessionRequired: integer(
			"backchannel_logout_session_required",
			{ mode: "boolean" },
		),
		jwks: text("jwks"),
		jwksUri: text("jwks_uri"),
		dpopBoundAccessTokens: integer("dpop_bound_access_tokens", {
			mode: "boolean",
		}).default(false),
		grantTypes: text("grant_types", { mode: "json" }).$type<string[]>(),
		responseTypes: text("response_types", { mode: "json" }).$type<string[]>(),
		public: integer("public", { mode: "boolean" }),
		type: text("type"),
		requirePKCE: integer("require_pkce", { mode: "boolean" }),
		metadata: text("metadata", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
	},
	(table) => [
		index("oauth_client_client_id_idx").on(table.clientId),
		index("oauth_client_user_id_idx").on(table.userId),
	],
);

export const oauthRefreshToken = sqliteTable(
	"oauthRefreshToken",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		token: text("token").notNull().unique(),
		clientId: text("client_id").notNull(),
		sessionId: text("session_id"),
		userId: text("user_id").notNull(),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources", { mode: "json" }).$type<string[]>(),
		requestedUserInfoClaims: text("requested_user_info_claims", {
			mode: "json",
		}).$type<string[]>(),
		scopes: text("scopes", { mode: "json" }).notNull().$type<string[]>(),
		revoked: integer("revoked", { mode: "timestamp" }),
		rotatedAt: integer("rotated_at", { mode: "timestamp" }),
		rotationReplayResponse: text("rotation_replay_response"),
		rotationReplayExpiresAt: integer("rotation_replay_expires_at", {
			mode: "timestamp",
		}),
		confirmation: text("confirmation", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
		authTime: integer("auth_time", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("oauth_refresh_token_client_id_idx").on(table.clientId),
		index("oauth_refresh_token_user_id_idx").on(table.userId),
		index("oauth_refresh_token_authorization_code_id_idx").on(
			table.authorizationCodeId,
		),
	],
);

export const oauthAccessToken = sqliteTable(
	"oauthAccessToken",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		token: text("token").notNull().unique(),
		clientId: text("client_id").notNull(),
		sessionId: text("session_id"),
		refreshId: text("refresh_id"),
		userId: text("user_id"),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources", { mode: "json" }).$type<string[]>(),
		requestedUserInfoClaims: text("requested_user_info_claims", {
			mode: "json",
		}).$type<string[]>(),
		scopes: text("scopes", { mode: "json" }).notNull().$type<string[]>(),
		revoked: integer("revoked", { mode: "timestamp" }),
		confirmation: text("confirmation", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("oauth_access_token_client_id_idx").on(table.clientId),
		index("oauth_access_token_user_id_idx").on(table.userId),
		index("oauth_access_token_authorization_code_id_idx").on(
			table.authorizationCodeId,
		),
	],
);

export const oauthConsent = sqliteTable(
	"oauthConsent",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id").notNull(),
		clientId: text("client_id").notNull(),
		referenceId: text("reference_id"),
		resources: text("resources", { mode: "json" }).$type<string[]>(),
		requestedUserInfoClaims: text("requested_user_info_claims", {
			mode: "json",
		}).$type<string[]>(),
		scopes: text("scopes", { mode: "json" }).notNull().$type<string[]>(),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("oauth_consent_client_id_idx").on(table.clientId),
		index("oauth_consent_user_id_idx").on(table.userId),
	],
);

/** Protected MCP resource. Seeded from `oauthProvider({ resources })`. */
export const oauthResource = sqliteTable("oauthResource", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	identifier: text("identifier").notNull().unique(),
	name: text("name").notNull(),
	accessTokenTtl: integer("access_token_ttl"),
	refreshTokenTtl: integer("refresh_token_ttl"),
	signingAlgorithm: text("signing_algorithm"),
	signingKeyId: text("signing_key_id"),
	allowedScopes: text("allowed_scopes", { mode: "json" }).$type<string[]>(),
	customClaims: text("custom_claims", { mode: "json" }).$type<
		Record<string, unknown>
	>(),
	dpopBoundAccessTokensRequired: integer("dpop_bound_access_tokens_required", {
		mode: "boolean",
	}).default(false),
	disabled: integer("disabled", { mode: "boolean" }).default(false),
	createdAt: integer("created_at", { mode: "timestamp" }),
	updatedAt: integer("updated_at", { mode: "timestamp" }),
	policyVersion: integer("policy_version").default(1),
	metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
});

/** Which clients may request which resources. Unused while enforcement is off. */
export const oauthClientResource = sqliteTable(
	"oauthClientResource",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		clientId: text("client_id").notNull(),
		resourceId: text("resource_id").notNull(),
		metadata: text("metadata", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
		createdAt: integer("created_at", { mode: "timestamp" }),
	},
	(table) => [
		index("oauth_client_resource_client_id_idx").on(table.clientId),
		index("oauth_client_resource_resource_id_idx").on(table.resourceId),
		uniqueIndex("oauth_client_resource_client_resource_uidx").on(
			table.clientId,
			table.resourceId,
		),
	],
);

/** Replay guard for private_key_jwt client assertions. Id is the assertion digest. */
export const oauthClientAssertion = sqliteTable("oauthClientAssertion", {
	id: text("id").primaryKey(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});
