import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { normalizeSignupEmail } from "~/lib/tos-signup-intent.server";

export const ACCOUNT_NOT_FOUND_CODE = "account_not_found";

export const ACCOUNT_NOT_FOUND_MESSAGE =
	"No account found. Create an account instead.";

/**
 * Returns whether a user row exists for the normalized email.
 * Used by Sign In paths that must not send a magic link for unknown addresses.
 */
export async function userExistsByEmail(
	db: D1Database,
	email: string,
): Promise<boolean> {
	const normalized = normalizeSignupEmail(email);
	if (!normalized.includes("@")) return false;
	const drizzleDb = drizzle(db, { schema });
	const user = await drizzleDb.query.user.findFirst({
		where: eq(schema.user.email, normalized),
		columns: { id: true },
	});
	return Boolean(user);
}

/**
 * Sign In only: refuse unknown emails before magic-link send / OAuth proceed.
 * Throws React Router `data()` with the same shape as mobile social auth.
 */
export async function assertExistingUserForSignIn(
	db: D1Database,
	email: string,
): Promise<void> {
	const exists = await userExistsByEmail(db, email);
	if (!exists) {
		throw data(
			{
				error: ACCOUNT_NOT_FOUND_MESSAGE,
				code: ACCOUNT_NOT_FOUND_CODE,
			},
			{ status: 404 },
		);
	}
}
