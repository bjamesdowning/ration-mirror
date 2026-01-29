import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

/**
 * Retrieves a user's organization credit balance from the database.
 *
 * NOTE: Credits are now stored at the organization level, not on individual users.
 * This function returns the credit balance for the specified organization.
 *
 * @deprecated Use checkBalance from ledger.server.ts instead for direct organization credit checks
 */
export async function getUserWithCredits(
	db: D1Database,
	userId: string,
): Promise<{ credits: number } | null> {
	const d1 = drizzle(db, { schema });

	// Find user's personal organization
	const personalOrg = await d1.query.organization.findFirst({
		where: (org, { like }) => like(org.slug, `personal-${userId}`),
		columns: {
			credits: true,
		},
	});

	if (!personalOrg) return null;

	return {
		credits: personalOrg.credits ?? 0,
	};
}
