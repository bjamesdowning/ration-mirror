import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data, redirect } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { redactId } from "~/lib/logging.server";
import type { Route } from "./+types/purge";

async function deleteR2Prefix(bucket: R2Bucket, prefix: string) {
	let cursor: string | undefined;
	do {
		const list = await bucket.list({ prefix, cursor });
		if (list.objects.length > 0) {
			await bucket.delete(list.objects.map((obj) => obj.key));
		}
		cursor = list.truncated ? list.cursor : undefined;
	} while (cursor);
}

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const userId = user.id;

	const env = context.cloudflare.env;
	const db = drizzle(env.DB, { schema });
	const storage = env.STORAGE;
	const vectorize = (
		env as {
			VECTORIZE?: { deleteByPrefix?: (prefix: string) => Promise<void> };
		}
	).VECTORIZE;

	console.log(`[Purge] Request to delete user account: ${redactId(userId)}`);

	try {
		// D1 does not support traditional SQL transactions (BEGIN/COMMIT) via Drizzle's db.transaction.
		// We use sequential execution.

		// 1. Clear activeOrganizationId for all the user's sessions first
		console.log("[Purge] 1. Clearing session org references...");
		await db
			.update(schema.session)
			.set({ activeOrganizationId: null })
			.where(eq(schema.session.userId, userId));

		// 2. Handle Organizations Owned by User
		console.log("[Purge] 2. Checking owned organizations...");
		const userMemberships = await db
			.select()
			.from(schema.member)
			.where(eq(schema.member.userId, userId));

		const ownedMemberships = userMemberships.filter(
			(item) => item.role === "owner",
		);

		for (const membership of ownedMemberships) {
			const orgId = membership.organizationId;

			const allMembers = await db
				.select()
				.from(schema.member)
				.where(eq(schema.member.organizationId, orgId));

			const otherMembers = allMembers.filter((m) => m.userId !== userId);

			if (otherMembers.length === 0) {
				console.log(
					`[Purge] Deleting sole-owned organization ${redactId(orgId)}...`,
				);
				// Clear activeOrganizationId for ALL users if this org is about to be deleted
				await db
					.update(schema.session)
					.set({ activeOrganizationId: null })
					.where(eq(schema.session.activeOrganizationId, orgId));

				// Manual cleanup of data
				await db
					.delete(schema.inventory)
					.where(eq(schema.inventory.organizationId, orgId));
				await db
					.delete(schema.meal)
					.where(eq(schema.meal.organizationId, orgId));
				await db
					.delete(schema.groceryList)
					.where(eq(schema.groceryList.organizationId, orgId));
				await db
					.delete(schema.ledger)
					.where(eq(schema.ledger.organizationId, orgId));
				await db
					.delete(schema.invitation)
					.where(eq(schema.invitation.organizationId, orgId));
				await db
					.delete(schema.member)
					.where(eq(schema.member.organizationId, orgId));

				await db
					.delete(schema.organization)
					.where(eq(schema.organization.id, orgId));
				console.log(`[Purge] Deleted owned organization ${redactId(orgId)}`);

				if (storage) {
					await deleteR2Prefix(storage, `organizations/${orgId}/`);
				}
				if (vectorize?.deleteByPrefix) {
					await vectorize.deleteByPrefix(`organizations/${orgId}/`);
				}
			} else {
				console.log(
					`[Purge] Transferring ownership of shared organization ${orgId}...`,
				);
				const newOwner =
					otherMembers.find((m) => m.role === "admin") || otherMembers[0];

				if (newOwner) {
					await db
						.update(schema.member)
						.set({ role: "owner" })
						.where(eq(schema.member.id, newOwner.id));
					console.log(
						`[Purge] Transferred org ${redactId(orgId)} ownership to ${redactId(newOwner.userId)}`,
					);
				}
			}
		}

		// 3. Delete all remaining memberships
		console.log("[Purge] 3. Deleting all memberships...");
		await db.delete(schema.member).where(eq(schema.member.userId, userId));

		// 4. Delete Invitations sent by user
		console.log("[Purge] 4. Deleting invitations...");
		await db
			.delete(schema.invitation)
			.where(eq(schema.invitation.inviterId, userId));

		// 5. Anonymize Ledger
		console.log("[Purge] 5. Anonymizing ledger entries...");
		await db
			.update(schema.ledger)
			.set({ userId: null })
			.where(eq(schema.ledger.userId, userId));

		// 6. Delete Session and Account (Better Auth tables)
		console.log("[Purge] 6. Deleting sessions and accounts...");
		await db.delete(schema.session).where(eq(schema.session.userId, userId));
		await db.delete(schema.account).where(eq(schema.account.userId, userId));

		// 7. Finally delete the User
		console.log("[Purge] 7. Deleting user record...");
		await db.delete(schema.user).where(eq(schema.user.id, userId));

		// 8. Delete user assets (R2/Vectorize)
		if (storage) {
			await deleteR2Prefix(storage, `users/${userId}/`);
		}
		if (vectorize?.deleteByPrefix) {
			await vectorize.deleteByPrefix(`users/${userId}/`);
		}

		console.log(
			`[Purge] Successfully deleted user account ${redactId(userId)}`,
		);
	} catch (error) {
		console.error(
			`[Purge] FATAL Error during user purge for ${redactId(userId)}:`,
			error,
		);
		const message = error instanceof Error ? error.message : String(error);
		throw data(
			{ error: `Account deletion failed: ${message}` },
			{ status: 500 },
		);
	}

	return redirect("/");
}
