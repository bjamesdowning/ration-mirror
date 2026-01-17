// @ts-nocheck
import { createClerkClient } from "@clerk/react-router/api.server";
import { getAuth } from "@clerk/react-router/ssr.server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { redirect } from "react-router";
import * as schema from "~/db/schema";
import type { Route } from "./+types/purge";

export async function action({ request, context }: Route.ActionArgs) {
	const { userId } = await getAuth({
		request,
		context,
	});

	if (!userId) {
		throw redirect("/sign-in");
	}

	const env = context.env;
	const db = drizzle(env.DB, { schema });

	// 1. Transactional Delete from D1
	await db.transaction(async (tx) => {
		// Delete Inventory
		await tx
			.delete(schema.inventory)
			.where(eq(schema.inventory.userId, userId));

		// Delete Ledger
		await tx.delete(schema.ledger).where(eq(schema.ledger.userId, userId));

		// Delete User
		await tx.delete(schema.users).where(eq(schema.users.id, userId));
	});

	// 2. Sign out from Clerk (and optionally delete from Clerk if we had the permission, but for now just sign out)
	// To truly delete from Clerk, we'd need the Backend API Key and proper permissions.
	// For this MVP, we will rely on the user manually deleting their Clerk account if they wish,
	// or we can attempt to delete it if we have the secret key.
	// Let's at least sign them out.

	try {
		const clerk = createClerkClient({
			secretKey: env.CLERK_SECRET_KEY,
			publishableKey: env.CLERK_PUBLISHABLE_KEY,
		});

		// Delete user from Clerk (optional, but good for "Right to Delete")
		await clerk.users.deleteUser(userId);
	} catch (error) {
		console.error("Failed to delete user from Clerk:", error);
		// Continue anyway, D1 is purged.
	}

	return redirect("/");
}
