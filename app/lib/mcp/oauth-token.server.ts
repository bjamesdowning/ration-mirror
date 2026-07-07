import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createLocalJWKSet, type JWTPayload, jwtVerify } from "jose";
import * as schema from "../../db/schema";
import {
	isLikelyJwt,
	RATION_ORG_CLAIM,
	resolveAuthorizationServerIssuer,
	resolveAuthorizationServerUrl,
	resolveMcpResourceAudience,
} from "../oauth.constants";
import { getJwksUrl } from "../oauth.server";
import { hashOAuthStoredToken } from "../oauth-token-hash.server";
import { hasOrgMembership } from "../org-membership.server";

const JWKS_KV_KEY = "oauth:jwks";
/** Shorter TTL limits exposure after signing-key removal (rotation refetch still applies). */
const JWKS_CACHE_TTL_SEC = 600;

export interface VerifiedMcpToken {
	userId: string;
	organizationId: string;
	scopes: string[];
	clientId?: string;
}

async function fetchJwksJson(
	authServerUrl: string,
): Promise<{ keys: Record<string, unknown>[] }> {
	const res = await fetch(`${authServerUrl}/api/auth/jwks`, {
		headers: { Accept: "application/json" },
	});
	if (!res.ok) {
		throw new Error("Unable to fetch authorization server JWKS");
	}
	return res.json();
}

async function loadJwksSet(
	kv: KVNamespace,
	authServerUrl: string,
	forceRefresh: boolean,
): Promise<ReturnType<typeof createLocalJWKSet>> {
	if (!forceRefresh) {
		const cached = await kv.get(JWKS_KV_KEY);
		if (cached) {
			const parsed = JSON.parse(cached) as { keys: Record<string, unknown>[] };
			return createLocalJWKSet(parsed);
		}
	}

	const jwks = await fetchJwksJson(authServerUrl);
	await kv.put(JWKS_KV_KEY, JSON.stringify(jwks), {
		expirationTtl: JWKS_CACHE_TTL_SEC,
	});
	return createLocalJWKSet(jwks);
}

/**
 * `true` when jose could not find a key matching the token's `kid` — the signal
 * that the cached JWKS is stale (signing-key rotation), not that the token is bad.
 */
function isNoMatchingKeyError(err: unknown): boolean {
	return (
		err instanceof Error &&
		(err as { code?: string }).code === "ERR_JWKS_NO_MATCHING_KEY"
	);
}

function extractScopes(payload: JWTPayload): string[] {
	const scopeClaim = payload.scope;
	if (typeof scopeClaim === "string") {
		return scopeClaim.split(/\s+/).filter(Boolean);
	}
	if (Array.isArray(payload.scopes)) {
		return payload.scopes.filter((s): s is string => typeof s === "string");
	}
	return [];
}

function extractMcpScopes(scopes: string[]): string[] {
	return scopes.filter((s) => s.startsWith("mcp:"));
}

/**
 * Whether the user still has an active OAuth consent for this client + household.
 * Revoking a grant deletes the consent row, so this makes revocation effective
 * immediately rather than waiting out the access-token TTL.
 */
async function hasActiveConsent(
	db: D1Database,
	userId: string,
	clientId: string,
	organizationId: string,
): Promise<boolean> {
	const d1 = drizzle(db, { schema });
	const consent = await d1.query.oauthConsent.findFirst({
		where: and(
			eq(schema.oauthConsent.userId, userId),
			eq(schema.oauthConsent.clientId, clientId),
			eq(schema.oauthConsent.referenceId, organizationId),
		),
		columns: { id: true },
	});
	return !!consent;
}

async function finalizeVerifiedToken(
	env: Cloudflare.Env,
	params: {
		userId: string;
		organizationId: string | null | undefined;
		scopes: string[];
		clientId: string | null | undefined;
	},
): Promise<VerifiedMcpToken> {
	const organizationId = params.organizationId;
	if (!organizationId) {
		throw new Error("OAuth token missing organization binding");
	}

	const isMember = await hasOrgMembership(
		env.DB,
		params.userId,
		organizationId,
	);
	if (!isMember) {
		throw new Error("OAuth token organization access revoked");
	}

	const mcpScopes = extractMcpScopes(params.scopes);
	if (mcpScopes.length === 0) {
		throw new Error("OAuth token missing MCP scopes");
	}

	const clientId = params.clientId ?? undefined;
	if (!clientId) {
		throw new Error("Invalid OAuth access token");
	}

	const consentActive = await hasActiveConsent(
		env.DB,
		params.userId,
		clientId,
		organizationId,
	);
	if (!consentActive) {
		throw new Error("OAuth grant revoked");
	}

	return {
		userId: params.userId,
		organizationId,
		scopes: mcpScopes,
		clientId,
	};
}

/**
 * Better Auth issues opaque (non-JWT) access tokens when the token exchange
 * omits RFC 8707 `resource`. Some MCP clients (e.g. Warp) do this; validate
 * against the hashed row in oauthAccessToken instead.
 */
async function verifyOpaqueMcpAccessToken(
	env: Cloudflare.Env,
	rawToken: string,
): Promise<VerifiedMcpToken> {
	const tokenHash = await hashOAuthStoredToken(rawToken);
	const d1 = drizzle(env.DB, { schema });
	const row = await d1.query.oauthAccessToken.findFirst({
		where: eq(schema.oauthAccessToken.token, tokenHash),
	});

	if (!row?.userId || !row.expiresAt || row.expiresAt < new Date()) {
		throw new Error("Invalid OAuth access token");
	}

	if (row.sessionId) {
		const session = await d1.query.session.findFirst({
			where: eq(schema.session.id, row.sessionId),
			columns: { expiresAt: true },
		});
		if (!session || session.expiresAt < new Date()) {
			throw new Error("Invalid OAuth access token");
		}
	}

	return finalizeVerifiedToken(env, {
		userId: row.userId,
		organizationId: row.referenceId,
		scopes: row.scopes,
		clientId: row.clientId,
	});
}

async function verifyJwtMcpAccessToken(
	env: Cloudflare.Env,
	rawToken: string,
): Promise<VerifiedMcpToken> {
	const issuer = resolveAuthorizationServerIssuer(env);
	const authServerBase = resolveAuthorizationServerUrl(env);
	const audience = resolveMcpResourceAudience(env);

	let payload: JWTPayload;
	try {
		const jwks = await loadJwksSet(env.RATION_KV, authServerBase, false);
		payload = (await jwtVerify(rawToken, jwks, { issuer, audience })).payload;
	} catch (err) {
		if (!isNoMatchingKeyError(err)) {
			throw new Error("Invalid OAuth access token");
		}
		try {
			const fresh = await loadJwksSet(env.RATION_KV, authServerBase, true);
			payload = (await jwtVerify(rawToken, fresh, { issuer, audience }))
				.payload;
		} catch {
			throw new Error("Invalid OAuth access token");
		}
	}

	const userId = typeof payload.sub === "string" ? payload.sub : null;
	if (!userId) {
		throw new Error("Invalid OAuth access token");
	}

	// Audience is already enforced by jwtVerify({ audience }) above.

	const orgClaim = payload[RATION_ORG_CLAIM];
	const organizationId =
		typeof orgClaim === "string"
			? orgClaim
			: typeof payload.referenceId === "string"
				? payload.referenceId
				: null;

	const clientId =
		typeof payload.client_id === "string"
			? payload.client_id
			: typeof payload.azp === "string"
				? payload.azp
				: null;

	return finalizeVerifiedToken(env, {
		userId,
		organizationId,
		scopes: extractScopes(payload),
		clientId,
	});
}

/**
 * Verify a Better Auth access token for MCP resource access (JWT or opaque).
 */
export async function verifyMcpOAuthToken(
	env: Cloudflare.Env,
	rawToken: string,
): Promise<VerifiedMcpToken> {
	if (isLikelyJwt(rawToken)) {
		try {
			return await verifyJwtMcpAccessToken(env, rawToken);
		} catch (jwtError) {
			// A JWT-shaped string may still be an opaque token in edge cases.
			if (
				jwtError instanceof Error &&
				jwtError.message === "Invalid OAuth access token"
			) {
				return verifyOpaqueMcpAccessToken(env, rawToken);
			}
			throw jwtError;
		}
	}

	return verifyOpaqueMcpAccessToken(env, rawToken);
}

/** Invalidate cached JWKS (call after key rotation). */
export async function invalidateJwksCache(kv: KVNamespace): Promise<void> {
	await kv.delete(JWKS_KV_KEY);
}

export { getJwksUrl };
