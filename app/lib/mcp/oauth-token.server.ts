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

const JWKS_KV_KEY = "oauth:jwks";
const JWKS_CACHE_TTL_SEC = 3600;

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

function extractAudience(payload: JWTPayload): string[] {
	const aud = payload.aud;
	if (!aud) return [];
	return Array.isArray(aud) ? aud.map(String) : [String(aud)];
}

async function validateOrgMembership(
	db: D1Database,
	userId: string,
	organizationId: string,
): Promise<boolean> {
	const d1 = drizzle(db, { schema });
	const membership = await d1.query.member.findFirst({
		where: and(
			eq(schema.member.userId, userId),
			eq(schema.member.organizationId, organizationId),
		),
		columns: { id: true },
	});
	return !!membership;
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

/**
 * Verify a Better Auth JWT access token for MCP resource access.
 */
export async function verifyMcpOAuthToken(
	env: Cloudflare.Env,
	rawToken: string,
): Promise<VerifiedMcpToken> {
	if (!isLikelyJwt(rawToken)) {
		throw new Error("Invalid OAuth access token");
	}

	// `issuer` must equal the JWT `iss` claim, which Better Auth sets to the
	// origin plus its `/api/auth` basePath. `authServerBase` is the bare origin
	// used to build the JWKS fetch URL (it appends `/api/auth/jwks`).
	const issuer = resolveAuthorizationServerIssuer(env);
	const authServerBase = resolveAuthorizationServerUrl(env);
	const audience = resolveMcpResourceAudience(env);

	let payload: JWTPayload;
	try {
		const jwks = await loadJwksSet(env.RATION_KV, authServerBase, false);
		payload = (await jwtVerify(rawToken, jwks, { issuer, audience })).payload;
	} catch (err) {
		// A missing `kid` means the cached JWKS predates a key rotation. Refetch
		// once with a fresh set before rejecting; any other failure is terminal.
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

	const audiences = extractAudience(payload);
	if (!audiences.includes(audience)) {
		throw new Error("OAuth token audience mismatch");
	}

	const orgClaim = payload[RATION_ORG_CLAIM];
	const organizationId =
		typeof orgClaim === "string"
			? orgClaim
			: typeof payload.referenceId === "string"
				? payload.referenceId
				: null;

	if (!organizationId) {
		throw new Error("OAuth token missing organization binding");
	}

	const isMember = await validateOrgMembership(env.DB, userId, organizationId);
	if (!isMember) {
		throw new Error("OAuth token organization access revoked");
	}

	const scopes = extractScopes(payload).filter((s) => s.startsWith("mcp:"));
	if (scopes.length === 0) {
		throw new Error("OAuth token missing MCP scopes");
	}

	const clientId =
		typeof payload.client_id === "string"
			? payload.client_id
			: typeof payload.azp === "string"
				? payload.azp
				: undefined;

	if (!clientId) {
		throw new Error("Invalid OAuth access token");
	}

	// Enforce that the user hasn't revoked this grant since the token was issued.
	const consentActive = await hasActiveConsent(
		env.DB,
		userId,
		clientId,
		organizationId,
	);
	if (!consentActive) {
		throw new Error("OAuth grant revoked");
	}

	return { userId, organizationId, scopes, clientId };
}

/** Invalidate cached JWKS (call after key rotation). */
export async function invalidateJwksCache(kv: KVNamespace): Promise<void> {
	await kv.delete(JWKS_KV_KEY);
}

export { getJwksUrl };
