import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { CLAIM_TOKEN_SLIDE_MS } from "./claim.constants";

/**
 * Extend claim token validity for active unclaimed kitchens (Option B).
 * Called fire-and-forget after successful API key authentication.
 */
export async function slideClaimTokenExpiry(
	db: D1Database,
	organizationId: string,
	now = new Date(),
): Promise<void> {
	const d1 = drizzle(db, { schema });
	const registration = await d1.query.agentRegistration.findFirst({
		where: and(
			eq(schema.agentRegistration.organizationId, organizationId),
			eq(schema.agentRegistration.status, "pending_claim"),
		),
		columns: { id: true },
	});

	if (!registration) return;

	const claimTokenExpiresAt = new Date(now.getTime() + CLAIM_TOKEN_SLIDE_MS);
	await d1
		.update(schema.agentRegistration)
		.set({ claimTokenExpiresAt })
		.where(eq(schema.agentRegistration.id, registration.id));
}
