import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { log, redactId } from "./logging.server";
import {
	OAUTH_MCP_SCOPES,
	RATION_ORG_CLAIM,
	resolveAuthorizationServerUrl,
} from "./oauth.constants";
import { normalizeOAuthScopes } from "./oauth-scopes";
import { chunkedQuery } from "./query-utils.server";

export interface ConnectedAgentGrant {
	consentId: string;
	clientId: string;
	clientName: string | null;
	organizationId: string | null;
	organizationName: string | null;
	scopes: string[];
	createdAt: Date;
	updatedAt: Date;
}

function hasMcpScope(scopes: readonly string[]): boolean {
	return scopes.some((s) => s.startsWith("mcp:"));
}

/** Whether OAuth org selection is required for the requested scopes. */
export function requiresOAuthOrgSelection(scopes: readonly string[]): boolean {
	return hasMcpScope(scopes);
}

/**
 * Better Auth `postLogin.shouldRedirect`: show the household picker until the
 * session has a valid `activeOrganizationId` for one of the user's memberships.
 *
 * Better Auth 1.6.16+ no longer passes `postLogin: true` into authorize on
 * `oauth2Continue` — it only skips this gate when `ba_pl` matches (set at
 * consent). After the user picks a household we must return false here so
 * continue advances to consent instead of looping back to select-org.
 */
export async function shouldOAuthPostLoginRedirect(
	env: Cloudflare.Env,
	userId: string,
	scopes: readonly string[],
	activeOrganizationId?: string | null,
): Promise<boolean> {
	if (!requiresOAuthOrgSelection(scopes)) {
		return false;
	}

	const db = drizzle(env.DB, { schema });
	const memberships = await db
		.select({ organizationId: schema.member.organizationId })
		.from(schema.member)
		.where(eq(schema.member.userId, userId));

	if (memberships.length === 0) {
		return true;
	}

	if (
		typeof activeOrganizationId === "string" &&
		memberships.some((m) => m.organizationId === activeOrganizationId)
	) {
		return false;
	}

	return true;
}

/**
 * List active OAuth consents (connected agents) for a user.
 */
export async function listConnectedAgentGrants(
	env: Cloudflare.Env,
	userId: string,
): Promise<ConnectedAgentGrant[]> {
	const db = drizzle(env.DB, { schema });
	const consents = await db.query.oauthConsent.findMany({
		where: eq(schema.oauthConsent.userId, userId),
	});

	if (consents.length === 0) {
		return [];
	}

	const clientIds = [...new Set(consents.map((c) => c.clientId))];
	const orgIds = [
		...new Set(
			consents
				.map((c) => c.referenceId)
				.filter((id): id is string => typeof id === "string"),
		),
	];

	const clientRows = await chunkedQuery(clientIds, (chunk) =>
		db
			.select({
				clientId: schema.oauthClient.clientId,
				name: schema.oauthClient.name,
			})
			.from(schema.oauthClient)
			.where(inArray(schema.oauthClient.clientId, chunk)),
	);
	const clientNameById = new Map(
		clientRows.map((row) => [row.clientId, row.name] as const),
	);

	const orgRows =
		orgIds.length > 0
			? await chunkedQuery(orgIds, (chunk) =>
					db
						.select({
							id: schema.organization.id,
							name: schema.organization.name,
						})
						.from(schema.organization)
						.where(inArray(schema.organization.id, chunk)),
				)
			: [];
	const orgNameById = new Map(
		orgRows.map((row) => [row.id, row.name] as const),
	);

	const results: ConnectedAgentGrant[] = consents.map((consent) => ({
		consentId: consent.id,
		clientId: consent.clientId,
		clientName: clientNameById.get(consent.clientId) ?? null,
		organizationId: consent.referenceId ?? null,
		organizationName: consent.referenceId
			? (orgNameById.get(consent.referenceId) ?? null)
			: null,
		scopes: normalizeOAuthScopes(consent.scopes),
		createdAt: consent.createdAt,
		updatedAt: consent.updatedAt,
	}));

	return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Revoke a user's OAuth consent grant and associated refresh tokens.
 */
export async function revokeConnectedAgentGrant(
	env: Cloudflare.Env,
	userId: string,
	consentId: string,
): Promise<boolean> {
	const db = drizzle(env.DB, { schema });
	const [consent] = await db
		.select()
		.from(schema.oauthConsent)
		.where(
			and(
				eq(schema.oauthConsent.id, consentId),
				eq(schema.oauthConsent.userId, userId),
			),
		)
		.limit(1);

	if (!consent) return false;

	const now = new Date();
	const refreshTokenFilters = [
		eq(schema.oauthRefreshToken.userId, userId),
		eq(schema.oauthRefreshToken.clientId, consent.clientId),
	];
	if (consent.referenceId) {
		refreshTokenFilters.push(
			eq(schema.oauthRefreshToken.referenceId, consent.referenceId),
		);
	}

	await db
		.update(schema.oauthRefreshToken)
		.set({ revoked: now })
		.where(and(...refreshTokenFilters));

	await db
		.delete(schema.oauthConsent)
		.where(eq(schema.oauthConsent.id, consentId));

	log.info("oauth_grant_revoked", {
		event: "oauth_grant_revoked",
		userId: redactId(userId),
		clientId: redactId(consent.clientId),
		orgId: consent.referenceId ? redactId(consent.referenceId) : undefined,
	});

	return true;
}

export function buildOAuthAccessTokenClaims(
	referenceId?: string,
): Record<string, string> {
	if (!referenceId) return {};
	return { [RATION_ORG_CLAIM]: referenceId };
}

export function getJwksUrl(env: Cloudflare.Env): string {
	const issuer = resolveAuthorizationServerUrl(env);
	return `${issuer}/api/auth/jwks`;
}

export { OAUTH_MCP_SCOPES };
