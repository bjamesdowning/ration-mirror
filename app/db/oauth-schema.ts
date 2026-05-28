/**
 * Better Auth OAuth Provider + JWT plugin tables.
 * Table names match Better Auth model names (camelCase).
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
		scopes: text("scopes", { mode: "json" }).notNull().$type<string[]>(),
		revoked: integer("revoked", { mode: "timestamp" }),
		authTime: integer("auth_time", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("oauth_refresh_token_client_id_idx").on(table.clientId),
		index("oauth_refresh_token_user_id_idx").on(table.userId),
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
		scopes: text("scopes", { mode: "json" }).notNull().$type<string[]>(),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("oauth_access_token_client_id_idx").on(table.clientId),
		index("oauth_access_token_user_id_idx").on(table.userId),
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
		scopes: text("scopes", { mode: "json" }).notNull().$type<string[]>(),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("oauth_consent_client_id_idx").on(table.clientId),
		index("oauth_consent_user_id_idx").on(table.userId),
	],
);
