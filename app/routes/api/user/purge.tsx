import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { redirect } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { data } from "~/lib/response";
import type { Route } from "./+types/purge";

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const userId = user.id;

	const env = context.cloudflare.env;
	const db = drizzle(env.DB, { schema });

	console.log(
		`[Purge] Request to delete user account: ${userId} (${user.email})`,
	);

	try {
		await db.transaction(async (tx) => {
			// 1. Clear activeOrganizationId for all the user's sessions first
			console.log("[Purge] 1. Clearing session org references...");
			await tx
				.update(schema.session)
				.set({ activeOrganizationId: null })
				.where(eq(schema.session.userId, userId));

			// 2. Handle Organizations Owned by User
			console.log("[Purge] 2. Checking owned organizations...");
			const ownedMemberships = await tx
				.select()
				.from(schema.member)
				.where(eq(schema.member.userId, userId))
				.then((m) => m.filter((item) => item.role === "owner"));

			for (const membership of ownedMemberships) {
				const orgId = membership.organizationId;

				const allMembers = await tx
					.select()
					.from(schema.member)
					.where(eq(schema.member.organizationId, orgId));

				const otherMembers = allMembers.filter((m) => m.userId !== userId);

				if (otherMembers.length === 0) {
					console.log(`[Purge] Deleting sole-owned organization ${orgId}...`);
					// Clear activeOrganizationId for ALL users if this org is about to be deleted
					await tx
						.update(schema.session)
						.set({ activeOrganizationId: null })
						.where(eq(schema.session.activeOrganizationId, orgId));

					// Manual cleanup of data just in case cascade is flaky
					await tx
						.delete(schema.inventory)
						.where(eq(schema.inventory.organizationId, orgId));
					await tx
						.delete(schema.meal)
						.where(eq(schema.meal.organizationId, orgId));
					await tx
						.delete(schema.groceryList)
						.where(eq(schema.groceryList.organizationId, orgId));
					await tx
						.delete(schema.ledger)
						.where(eq(schema.ledger.organizationId, orgId));
					await tx
						.delete(schema.invitation)
						.where(eq(schema.invitation.organizationId, orgId));
					await tx
						.delete(schema.member)
						.where(eq(schema.member.organizationId, orgId));

					await tx
						.delete(schema.organization)
						.where(eq(schema.organization.id, orgId));
					console.log(`[Purge] Deleted owned organization ${orgId}`);
				} else {
					console.log(
						`[Purge] Transferring ownership of shared organization ${orgId}...`,
					);
					const newOwner =
						otherMembers.find((m) => m.role === "admin") || otherMembers[0];

					if (newOwner) {
						await tx
							.update(schema.member)
							.set({ role: "owner" })
							.where(eq(schema.member.id, newOwner.id));
						console.log(
							`[Purge] Transferred org ${orgId} ownership to ${newOwner.userId}`,
						);
					}
				}
			}

			// 3. Delete all remaining memberships
			console.log("[Purge] 3. Deleting all memberships...");
			await tx.delete(schema.member).where(eq(schema.member.userId, userId));

			// 4. Delete Invitations sent by user
			console.log("[Purge] 4. Deleting invitations...");
			await tx
				.delete(schema.invitation)
				.where(eq(schema.invitation.inviterId, userId));

			// 5. Anonymize Ledger
			console.log("[Purge] 5. Anonymizing ledger entries...");
			await tx
				.update(schema.ledger)
				.set({ userId: null })
				.where(eq(schema.ledger.userId, userId));

			// 6. Delete Session and Account (Better Auth tables)
			console.log("[Purge] 6. Deleting sessions and accounts...");
			await tx.delete(schema.session).where(eq(schema.session.userId, userId));
			await tx.delete(schema.account).where(eq(schema.account.userId, userId));

			// 7. Finally delete the User
			console.log("[Purge] 7. Deleting user record...");
			await tx.delete(schema.user).where(eq(schema.user.id, userId));

			console.log(`[Purge] Successfully deleted user account ${userId}`);
		});
	} catch (error) {
		console.error(
			`[Purge] FATAL Error during user purge for ${userId}:`,
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
