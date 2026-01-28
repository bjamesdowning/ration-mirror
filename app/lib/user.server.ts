import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

/**
 * Retrieves a user with their credit balance from the database.
 * Use this instead of relying on session.user for extended fields.
 *
 * Better Auth's getSession() only returns core user fields (id, name, email, image).
 * This function fetches the full user record including our custom extensions.
 */
export async function getUserWithCredits(
	db: D1Database,
	userId: string,
): Promise<{ credits: number } | null> {
	const d1 = drizzle(db, { schema });

	const user = await d1.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: {
			credits: true,
		},
	});

	if (!user) return null;

	return {
		credits: user.credits ?? 0,
	};
}
