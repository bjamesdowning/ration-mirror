import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { jwtVerify, SignJWT } from "jose";
import * as schema from "~/db/schema";
import {
	MOBILE_ACCESS_TTL_SEC,
	MOBILE_AUTH_CODE_KV_PREFIX,
	MOBILE_AUTH_CODE_TTL_SEC,
	MOBILE_JWT_AUDIENCE,
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

	return {
		accessToken,
		refreshToken,
		expiresIn: MOBILE_ACCESS_TTL_SEC,
	};
}

export async function rotateMobileRefreshToken(
	env: Cloudflare.Env,
	refreshToken: string,
): Promise<MobileTokenPair> {
	const db = drizzle(env.DB, { schema });
	const tokenHash = await hashOAuthStoredToken(refreshToken);
	const row = await db.query.mobileRefreshToken.findFirst({
		where: eq(schema.mobileRefreshToken.tokenHash, tokenHash),
	});

	if (!row || row.revokedAt || row.expiresAt < new Date()) {
		if (row?.familyId) {
			await db
				.update(schema.mobileRefreshToken)
				.set({ revokedAt: new Date() })
				.where(eq(schema.mobileRefreshToken.familyId, row.familyId));
		}
		throw new Error("invalid_refresh_token");
	}

	await assertMobileOrgMembership(env, row.userId, row.organizationId);

	await db
		.update(schema.mobileRefreshToken)
		.set({ revokedAt: new Date() })
		.where(eq(schema.mobileRefreshToken.id, row.id));

	return issueMobileTokenPair(
		env,
		row.userId,
		row.organizationId,
		row.familyId,
	);
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

export async function storeMobileAuthCode(
	kv: KVNamespace,
	userId: string,
	organizationId: string,
): Promise<string> {
	const code = crypto.randomUUID();
	await kv.put(
		`${MOBILE_AUTH_CODE_KV_PREFIX}${code}`,
		JSON.stringify({ userId, organizationId }),
		{ expirationTtl: MOBILE_AUTH_CODE_TTL_SEC },
	);
	return code;
}

export async function consumeMobileAuthCode(
	kv: KVNamespace,
	code: string,
): Promise<MobileAccessClaims | null> {
	const key = `${MOBILE_AUTH_CODE_KV_PREFIX}${code}`;
	const raw = await kv.get(key);
	if (!raw) return null;
	await kv.delete(key);
	const parsed = JSON.parse(raw) as {
		userId?: string;
		organizationId?: string;
	};
	if (
		typeof parsed.userId !== "string" ||
		typeof parsed.organizationId !== "string"
	) {
		return null;
	}
	return {
		userId: parsed.userId,
		organizationId: parsed.organizationId,
	};
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
