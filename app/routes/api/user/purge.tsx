// @ts-nocheck
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { redirect } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import type { Route } from "./+types/purge";

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const userId = user.id;

	const env = context.cloudflare.env;
	const db = drizzle(env.DB, { schema });

	// 1. Transactional Delete from D1
	await db.transaction(async (tx) => {
		// Delete Inventory
		await tx
			.delete(schema.inventory)
			.where(eq(schema.inventory.userId, userId));

		// Delete Ledger
		await tx.delete(schema.ledger).where(eq(schema.ledger.userId, userId));

		// Delete User (and sessions/accounts due to FK cascade if configured, or manual)
		// Better auth tables: user, session, account.
		// We should delete user from 'user' table.
		// If FKs are set to CASCADE (schema default for references usually NO ACTION unless specified), we might need to delete children.
		// But in our schema we didn't specify onDelete: 'cascade'.
		// We should manually delete session and account to be safe, or just delete user and hope D1 supports FK enforcement/cascade if enabled.
		// Let's delete user and assumes app logic handles it or we manually clean.
		// Actually, Better Auth might need session deletion to "sign out" effectively if checking DB.

		await tx.delete(schema.session).where(eq(schema.session.userId, userId));
		await tx.delete(schema.account).where(eq(schema.account.userId, userId));
		await tx.delete(schema.user).where(eq(schema.user.id, userId));
	});

	// No Clerk deletion needed as we are self-hosted.

	return redirect("/");
}
