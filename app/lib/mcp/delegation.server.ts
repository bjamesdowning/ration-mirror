import {
	type DelegationTokenClaims,
	verifyDelegationTokenClaims,
} from "../fin-delegation.server";
import { resolveAuthorizationServerUrl } from "../oauth.constants";
import { hasOrgMembership } from "../org-membership.server";

export class McpDelegationError extends Error {
	override name = "McpDelegationError" as const;
	readonly code:
		| "delegation_not_allowed"
		| "actor_token_required"
		| "invalid_delegation_token"
		| "delegation_membership_revoked";

	constructor(code: McpDelegationError["code"], message: string) {
		super(message);
		this.code = code;
	}
}

/** Parse comma-separated Fin OAuth client IDs allowed to use delegation. */
export function parseFinDelegationClientIds(
	raw: string | undefined,
): Set<string> {
	if (!raw?.trim()) return new Set();
	return new Set(
		raw
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean),
	);
}

export function isFinDelegationClient(
	env: Cloudflare.Env,
	clientId: string | undefined,
): boolean {
	if (!clientId) return false;
	const allowlist = parseFinDelegationClientIds(env.FIN_DELEGATION_CLIENT_IDS);
	return allowlist.has(clientId);
}

/**
 * Verify a delegation JWT and confirm the subject is still an active org member.
 */
export async function verifyDelegationToken(
	env: Cloudflare.Env,
	rawToken: string,
): Promise<DelegationTokenClaims> {
	const secret = env.FIN_MCP_DELEGATION_SECRET?.trim();
	if (!secret) {
		throw new McpDelegationError(
			"invalid_delegation_token",
			"Invalid delegation token",
		);
	}

	let claims: DelegationTokenClaims;
	try {
		claims = await verifyDelegationTokenClaims({
			rawToken,
			secret,
			issuer: resolveAuthorizationServerUrl(env),
		});
	} catch {
		throw new McpDelegationError(
			"invalid_delegation_token",
			"Invalid delegation token",
		);
	}

	const isMember = await hasOrgMembership(
		env.DB,
		claims.userId,
		claims.organizationId,
	);
	if (!isMember) {
		throw new McpDelegationError(
			"delegation_membership_revoked",
			"Delegation subject organization access revoked",
		);
	}

	return claims;
}
