import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { AGENT_API_KEY_SCOPES } from "../agent/scopes";
import { hashApiKey } from "../api-key.server";
import { MCP_ENDPOINT_URL } from "../mcp/connect-copy";
import { CURRENT_TOS_VERSION } from "../tos.constants";
import { CLAIM_TOKEN_SLIDE_MS } from "./claim.constants";
import { generateClaimToken, hashToken } from "./claim-crypto.server";
import { buildPersonalOrgRecords } from "./org-records.server";
import { buildAgentStubEmail } from "./stub-user";

const KEY_PREFIX_LENGTH = 17; // "rtn_live_" (9) + 8 chars
const KEY_SECRET_LENGTH = 32;
const KEY_PREFIX = "rtn_live_";

function generateSecureRandomHex(length: number): string {
	const bytes = new Uint8Array(Math.ceil(length / 2));
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, length);
}

export interface ProvisionAgentInput {
	request: Request;
	clientHint?: string;
}

export interface ProvisionAgentResult {
	userId: string;
	organizationId: string;
	registrationId: string;
	apiKey: { key: string; prefix: string; id: string };
	claimToken: string;
	claimUrl: string;
	mcpEndpoint: string;
	scopes: readonly string[];
}

/**
 * Create one agent-owned user, personal kitchen org, pre-claim API key, and
 * agent_registration row in a single D1 batch. Does NOT use Better Auth signup
 * (avoids double-firing the personal-org hook).
 */
export async function provisionAgentUser(
	env: Cloudflare.Env,
	input: ProvisionAgentInput,
): Promise<ProvisionAgentResult> {
	const db = drizzle(env.DB, { schema });
	const now = new Date();
	const userId = crypto.randomUUID();
	const registrationId = crypto.randomUUID();
	const apiKeyId = crypto.randomUUID();

	const userName = input.clientHint?.trim() || "Agent Kitchen";
	const { orgId, orgValues, memberValues } = buildPersonalOrgRecords(
		userId,
		userName,
	);

	const claimToken = generateClaimToken();
	const claimTokenHash = await hashToken(claimToken);
	const claimTokenExpiresAt = new Date(now.getTime() + CLAIM_TOKEN_SLIDE_MS);

	const secret = generateSecureRandomHex(KEY_SECRET_LENGTH);
	const rawKey = `${KEY_PREFIX}${secret}`;
	const keyPrefix = rawKey.slice(0, KEY_PREFIX_LENGTH);
	const keyHash = await hashApiKey(rawKey);
	const scopesJson = JSON.stringify([...AGENT_API_KEY_SCOPES]);

	const origin = new URL(input.request.url).origin;
	const claimUrl = `${origin}/connect/claim?token=${encodeURIComponent(claimToken)}`;

	await db.batch([
		db.insert(schema.user).values({
			id: userId,
			name: userName,
			email: buildAgentStubEmail(userId),
			emailVerified: false,
			createdAt: now,
			tosAcceptedAt: now,
			tosVersion: CURRENT_TOS_VERSION,
			tier: "free",
		}),
		db.insert(schema.organization).values(orgValues),
		db.insert(schema.member).values(memberValues),
		db.insert(schema.apiKey).values({
			id: apiKeyId,
			organizationId: orgId,
			userId,
			keyHash,
			keyPrefix,
			name: "Agent (pre-claim)",
			scopes: scopesJson,
			createdAt: now,
		}),
		db.insert(schema.agentRegistration).values({
			id: registrationId,
			userId,
			organizationId: orgId,
			apiKeyId,
			status: "pending_claim",
			claimTokenHash,
			claimTokenExpiresAt,
			clientHint: input.clientHint ?? null,
			preClaim: true,
			createdAt: now,
		}),
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	] as [any, ...any[]]);

	return {
		userId,
		organizationId: orgId,
		registrationId,
		apiKey: { key: rawKey, prefix: keyPrefix, id: apiKeyId },
		claimToken,
		claimUrl,
		mcpEndpoint: MCP_ENDPOINT_URL,
		scopes: AGENT_API_KEY_SCOPES,
	};
}
