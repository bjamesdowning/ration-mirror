import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { log, redactId } from "./logging.server";
import {
	OAUTH_MCP_SCOPES,
	RATION_ORG_CLAIM,
	resolveAuthorizationServerUrl,
} from "./oauth.constants";
import { normalizeOAuthScopes } from "./oauth-scopes";

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
 * Better Auth `postLogin.shouldRedirect`: MCP grants always require the
 * post-login household page before consent. `oauth2Continue({ postLogin: true })`
 * runs authorize with `postLogin` set, so this does not loop after Continue.
 */
export function shouldOAuthPostLoginRedirect(
	scopes: readonly string[],
	_activeOrganizationId?: string | null,
): boolean {
	return requiresOAuthOrgSelection(scopes);
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

	const results: ConnectedAgentGrant[] = [];
	for (const consent of consents) {
		const [client] = await db
			.select({
				name: schema.oauthClient.name,
			})
			.from(schema.oauthClient)
			.where(eq(schema.oauthClient.clientId, consent.clientId))
			.limit(1);

		let organizationName: string | null = null;
		if (consent.referenceId) {
			const org = await db.query.organization.findFirst({
				where: eq(schema.organization.id, consent.referenceId),
				columns: { name: true },
			});
			organizationName = org?.name ?? null;
		}

		results.push({
			consentId: consent.id,
			clientId: consent.clientId,
			clientName: client?.name ?? null,
			organizationId: consent.referenceId ?? null,
			organizationName,
			scopes: normalizeOAuthScopes(consent.scopes),
			createdAt: consent.createdAt,
			updatedAt: consent.updatedAt,
		});
	}

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
