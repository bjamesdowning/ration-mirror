import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import type { ApiKeyRecord } from "../api-key.server";
import { CLAIM_TOKEN_SLIDE_MS } from "./claim.constants";
import { generateClaimToken, hashToken } from "./claim-crypto.server";

export class ClaimReissueError extends Error {
	constructor(
		readonly code: "not_pending" | "not_agent_key",
		message: string,
	) {
		super(message);
		this.name = "ClaimReissueError";
	}
}

export interface ReissueClaimResult {
	claimToken: string;
	claimUrl: string;
	claimTokenExpiresAt: Date;
}

/**
 * Issue a new claim token for a pending_claim registration (Option A).
 * Invalidates the previous claim token hash.
 */
export async function reissueClaimToken(
	env: Cloudflare.Env,
	apiKeyRecord: ApiKeyRecord,
	request: Request,
	now = new Date(),
): Promise<ReissueClaimResult> {
	const db = drizzle(env.DB, { schema });
	const registration = await db.query.agentRegistration.findFirst({
		where: and(
			eq(schema.agentRegistration.organizationId, apiKeyRecord.organizationId),
			eq(schema.agentRegistration.apiKeyId, apiKeyRecord.id),
		),
	});

	if (!registration || registration.status !== "pending_claim") {
		throw new ClaimReissueError(
			"not_pending",
			"No unclaimed agent registration for this API key",
		);
	}

	const claimToken = generateClaimToken();
	const claimTokenHash = await hashToken(claimToken);
	const claimTokenExpiresAt = new Date(now.getTime() + CLAIM_TOKEN_SLIDE_MS);
	const origin = new URL(request.url).origin;
	const claimUrl = `${origin}/connect/claim?token=${encodeURIComponent(claimToken)}`;

	await db
		.update(schema.agentRegistration)
		.set({ claimTokenHash, claimTokenExpiresAt })
		.where(eq(schema.agentRegistration.id, registration.id));

	return { claimToken, claimUrl, claimTokenExpiresAt };
}
