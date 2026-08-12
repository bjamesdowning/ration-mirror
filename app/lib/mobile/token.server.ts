import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { jwtVerify, SignJWT } from "jose";
import * as schema from "~/db/schema";
import { recordLastActiveBillingOrg } from "~/lib/billing-idempotency.server";
import {
	MOBILE_ACCESS_TTL_SEC,
	MOBILE_AUTH_CODE_TTL_SEC,
	MOBILE_JWT_AUDIENCE,
	MOBILE_REFRESH_GRACE_KV_PREFIX,
	MOBILE_REFRESH_GRACE_TTL_SEC,
	MOBILE_REFRESH_TTL_SEC,
} from "~/lib/mobile/constants";
import { RATION_ORG_CLAIM } from "~/lib/oauth.constants";
import { hashOAuthStoredToken } from "~/lib/oauth-token-hash.server";
import { hasOrgMembership } from "~/lib/org-membership.server";

export interface MobileAccessClaims {
	userId: string;
	organizationId: string;
}

export interface MobileTokenPair {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
}

function getSigningSecret(env: Cloudflare.Env): Uint8Array {
	const secret = env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error("BETTER_AUTH_SECRET not configured");
	}
	return new TextEncoder().encode(secret);
}

export async function signMobileAccessToken(
	env: Cloudflare.Env,
	claims: MobileAccessClaims,
): Promise<string> {
	return new SignJWT({
		[RATION_ORG_CLAIM]: claims.organizationId,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(claims.userId)
		.setAudience(MOBILE_JWT_AUDIENCE)
		.setIssuedAt()
		.setExpirationTime(`${MOBILE_ACCESS_TTL_SEC}s`)
		.sign(getSigningSecret(env));
}

export async function verifyMobileAccessToken(
	env: Cloudflare.Env,
	token: string,
): Promise<MobileAccessClaims> {
	const { payload } = await jwtVerify(token, getSigningSecret(env), {
		audience: MOBILE_JWT_AUDIENCE,
	});
	const userId = payload.sub;
	const organizationId = payload[RATION_ORG_CLAIM];
	if (typeof userId !== "string" || typeof organizationId !== "string") {
		throw new Error("Invalid mobile access token claims");
	}
	return { userId, organizationId };
}

export async function issueMobileTokenPair(
	env: Cloudflare.Env,
	userId: string,
	organizationId: string,
	familyId?: string,
): Promise<MobileTokenPair> {
	const db = drizzle(env.DB, { schema });
	const refreshToken = crypto.randomUUID() + crypto.randomUUID();
	const tokenHash = await hashOAuthStoredToken(refreshToken);
	const family = familyId ?? crypto.randomUUID();
	const expiresAt = new Date(Date.now() + MOBILE_REFRESH_TTL_SEC * 1000);

	await db.insert(schema.mobileRefreshToken).values({
		userId,
		organizationId,
		tokenHash,
		familyId: family,
		expiresAt,
	});

	const accessToken = await signMobileAccessToken(env, {
		userId,
		organizationId,
	});

	// Best-effort: used by RevenueCat webhook credit routing when the event
	// has no organization_id subscriber attribute.
	try {
		await recordLastActiveBillingOrg(env.RATION_KV, userId, organizationId);
	} catch {
		// Token issue must not fail if KV is unavailable.
	}

	return {
		accessToken,
		refreshToken,
		expiresIn: MOBILE_ACCESS_TTL_SEC,
	};
}

function refreshGraceKey(tokenHash: string): string {
	return `${MOBILE_REFRESH_GRACE_KV_PREFIX}${tokenHash}`;
}

async function storeRefreshGracePair(
	kv: KVNamespace,
	oldTokenHash: string,
	pair: MobileTokenPair,
): Promise<void> {
	try {
		await kv.put(refreshGraceKey(oldTokenHash), JSON.stringify(pair), {
			expirationTtl: MOBILE_REFRESH_GRACE_TTL_SEC,
		});
	} catch {
		// Grace is best-effort; rotation already succeeded.
	}
}

async function readRefreshGracePair(
	kv: KVNamespace,
	oldTokenHash: string,
): Promise<MobileTokenPair | null> {
	try {
		const raw = await kv.get(refreshGraceKey(oldTokenHash));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<MobileTokenPair>;
		if (
			typeof parsed.accessToken !== "string" ||
			typeof parsed.refreshToken !== "string" ||
			typeof parsed.expiresIn !== "number"
		) {
			return null;
		}
		return {
			accessToken: parsed.accessToken,
			refreshToken: parsed.refreshToken,
			expiresIn: parsed.expiresIn,
		};
	} catch {
		return null;
	}
}

/**
 * Rotate a refresh token with an atomic claim so concurrent refreshers cannot
 * mint two valid family members (RFC 9700 public-client rotation).
 */
export async function rotateMobileRefreshToken(
	env: Cloudflare.Env,
	refreshToken: string,
): Promise<MobileTokenPair> {
	const db = drizzle(env.DB, { schema });
	const tokenHash = await hashOAuthStoredToken(refreshToken);
	const row = await db.query.mobileRefreshToken.findFirst({
		where: eq(schema.mobileRefreshToken.tokenHash, tokenHash),
	});

	if (!row) {
		throw new Error("invalid_refresh_token");
	}

	if (row.expiresAt < new Date()) {
		await db
			.update(schema.mobileRefreshToken)
			.set({ revokedAt: new Date() })
			.where(eq(schema.mobileRefreshToken.familyId, row.familyId));
		throw new Error("invalid_refresh_token");
	}

	if (row.revokedAt) {
		const grace = await readRefreshGracePair(env.RATION_KV, tokenHash);
		if (grace) return grace;
		await db
			.update(schema.mobileRefreshToken)
			.set({ revokedAt: new Date() })
			.where(eq(schema.mobileRefreshToken.familyId, row.familyId));
		throw new Error("invalid_refresh_token");
	}

	const claimedAt = new Date();
	const claim = await env.DB.prepare(
		"UPDATE mobile_refresh_token SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
	)
		.bind(Math.floor(claimedAt.getTime() / 1000), row.id)
		.run();

	if ((claim.meta.changes ?? 0) === 0) {
		const grace = await readRefreshGracePair(env.RATION_KV, tokenHash);
		if (grace) return grace;
		await db
			.update(schema.mobileRefreshToken)
			.set({ revokedAt: new Date() })
			.where(eq(schema.mobileRefreshToken.familyId, row.familyId));
		throw new Error("invalid_refresh_token");
	}

	await assertMobileOrgMembership(env, row.userId, row.organizationId);

	try {
		const pair = await issueMobileTokenPair(
			env,
			row.userId,
			row.organizationId,
			row.familyId,
		);
		await storeRefreshGracePair(env.RATION_KV, tokenHash, pair);
		return pair;
	} catch (error) {
		// Un-claim so a transient D1 failure does not strand the client.
		await env.DB.prepare(
			"UPDATE mobile_refresh_token SET revoked_at = NULL WHERE id = ? AND revoked_at = ?",
		)
			.bind(row.id, Math.floor(claimedAt.getTime() / 1000))
			.run();
		throw error;
	}
}

export async function revokeMobileRefreshFamilies(
	env: Cloudflare.Env,
	userId: string,
): Promise<void> {
	const db = drizzle(env.DB, { schema });
	await db
		.update(schema.mobileRefreshToken)
		.set({ revokedAt: new Date() })
		.where(eq(schema.mobileRefreshToken.userId, userId));
}

export interface MobileAuthCodeRecord extends MobileAccessClaims {
	/** S256 PKCE challenge the redeeming client must prove a verifier for. */
	codeChallenge: string;
}

export async function storeMobileAuthCode(
	env: Cloudflare.Env,
	userId: string,
	organizationId: string,
	codeChallenge: string,
): Promise<string> {
	const db = drizzle(env.DB, { schema });
	const code = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + MOBILE_AUTH_CODE_TTL_SEC * 1000);
	await db.insert(schema.mobileAuthCode).values({
		code,
		userId,
		organizationId,
		codeChallenge,
		expiresAt,
	});
	return code;
}

/**
 * Atomically consume a single-use auth code. Only one concurrent redeemer wins.
 */
export async function consumeMobileAuthCode(
	env: Cloudflare.Env,
	code: string,
): Promise<MobileAuthCodeRecord | null> {
	const db = drizzle(env.DB, { schema });
	const now = new Date();
	const rows = await db
		.update(schema.mobileAuthCode)
		.set({ consumedAt: now })
		.where(
			and(
				eq(schema.mobileAuthCode.code, code),
				isNull(schema.mobileAuthCode.consumedAt),
				gt(schema.mobileAuthCode.expiresAt, now),
			),
		)
		.returning({
			userId: schema.mobileAuthCode.userId,
			organizationId: schema.mobileAuthCode.organizationId,
			codeChallenge: schema.mobileAuthCode.codeChallenge,
		});

	const claimed = rows[0];
	if (!claimed) return null;
	return claimed;
}

export async function assertMobileOrgMembership(
	env: Cloudflare.Env,
	userId: string,
	organizationId: string,
): Promise<void> {
	const ok = await hasOrgMembership(env.DB, userId, organizationId);
	if (!ok) {
		throw new Error("forbidden_org");
	}
}

export async function getActiveMobileRefreshCount(
	env: Cloudflare.Env,
	userId: string,
): Promise<number> {
	const db = drizzle(env.DB, { schema });
	const rows = await db.query.mobileRefreshToken.findMany({
		where: eq(schema.mobileRefreshToken.userId, userId),
		columns: { id: true, revokedAt: true, expiresAt: true },
	});
	const now = new Date();
	return rows.filter((r) => !r.revokedAt && r.expiresAt >= now).length;
}
