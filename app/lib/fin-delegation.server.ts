import { jwtVerify, SignJWT } from "jose";

/** Audience claim — distinct from OAuth MCP resource audience to prevent replay. */
export const DELEGATION_TOKEN_AUDIENCE = "ration-mcp-delegation";

/** Delegation JWT lifetime — re-signed on every authenticated page load. */
export const DELEGATION_TOKEN_TTL_SEC = 86_400; // 24 hours

export type DelegationTokenClaims = {
	userId: string;
	organizationId: string;
};

export type SignDelegationTokenOptions = {
	userId: string;
	organizationId: string;
	secret: string;
	issuer: string;
	/** For tests — Unix seconds used as "now". */
	nowSeconds?: number;
};

function createDelegationSecretKey(secret: string): Uint8Array {
	return new TextEncoder().encode(secret.trim());
}

/**
 * Mint an HS256 delegation JWT for Fin MCP tool calls.
 * Shipped to Intercom as the signed `ration_mcp_delegation` user attribute.
 */
export async function signDelegationToken(
	options: SignDelegationTokenOptions,
): Promise<string | null> {
	const { userId, organizationId, secret, issuer, nowSeconds } = options;
	const uid = userId.trim();
	const orgId = organizationId.trim();
	const sec = secret.trim();
	const iss = issuer.trim();

	if (!uid || !orgId || !sec || !iss) {
		return null;
	}

	const now = nowSeconds ?? Math.floor(Date.now() / 1000);
	const jti = crypto.randomUUID();

	return new SignJWT({
		org: orgId,
		scope: "delegated",
	})
		.setProtectedHeader({ alg: "HS256", typ: "JWT" })
		.setSubject(uid)
		.setIssuer(iss)
		.setAudience(DELEGATION_TOKEN_AUDIENCE)
		.setIssuedAt(now)
		.setExpirationTime(now + DELEGATION_TOKEN_TTL_SEC)
		.setJti(jti)
		.sign(createDelegationSecretKey(sec));
}

export type VerifyDelegationTokenOptions = {
	rawToken: string;
	secret: string;
	issuer: string;
};

/**
 * Verify a delegation JWT signature and standard claims.
 * Does not check D1 membership — callers must enforce that separately.
 */
export async function verifyDelegationTokenClaims(
	options: VerifyDelegationTokenOptions,
): Promise<DelegationTokenClaims> {
	const { rawToken, secret, issuer } = options;
	const sec = secret.trim();
	const iss = issuer.trim();

	if (!sec || !iss) {
		throw new Error("Invalid delegation token");
	}

	let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
	try {
		const result = await jwtVerify(rawToken, createDelegationSecretKey(sec), {
			issuer: iss,
			audience: DELEGATION_TOKEN_AUDIENCE,
		});
		payload = result.payload;
	} catch {
		throw new Error("Invalid delegation token");
	}

	const userId = typeof payload.sub === "string" ? payload.sub : null;
	const organizationId =
		typeof payload.org === "string"
			? payload.org
			: typeof payload.organizationId === "string"
				? payload.organizationId
				: null;

	if (!userId || !organizationId) {
		throw new Error("Invalid delegation token");
	}

	return { userId, organizationId };
}
