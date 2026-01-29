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

	try {
		await db.transaction(async (tx) => {
			console.log(`[Purge] Starting purge for user ${userId}`);

			// 1. Handle Organizations Owned by User
			// Find all memberships where user is owner
			const ownedMemberships = await tx.query.member.findMany({
				where: (m, { and, eq }) =>
					and(eq(m.userId, userId), eq(m.role, "owner")),
			});

			for (const membership of ownedMemberships) {
				const orgId = membership.organizationId;

				// Check total member count
				const members = await tx.query.member.findMany({
					where: (m, { eq }) => eq(m.organizationId, orgId),
				});

				const otherMembers = members.filter((m) => m.userId !== userId);

				if (otherMembers.length === 0) {
					// User is the only member -> Delete Organization
					// Cascade should handle inventory, meals, etc.
					await tx
						.delete(schema.organization)
						.where(eq(schema.organization.id, orgId));
					console.log(`[Purge] Deleted owned organization ${orgId}`);
				} else {
					// Organization has other members
					// Identify a new owner (Admin or oldest member)
					// Prioritize admins
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

					// We (the user) will be removed in the next step (deleting all memberships)
				}
			}

			// 2. Delete all memberships (including the ones we just processed if org wasn't deleted)
			// This removes access to any shared groups
			await tx.delete(schema.member).where(eq(schema.member.userId, userId));

			// 3. Delete Invitations sent by user
			await tx
				.delete(schema.invitation)
				.where(eq(schema.invitation.inviterId, userId));

			// 4. Anonymize Ledger
			// We keep the financial record but remove the user link
			await tx
				.update(schema.ledger)
				.set({ userId: null })
				.where(eq(schema.ledger.userId, userId));

			// 5. Delete Session and Account (Better Auth tables)
			await tx.delete(schema.session).where(eq(schema.session.userId, userId));
			await tx.delete(schema.account).where(eq(schema.account.userId, userId));

			// 6. Delete User
			await tx.delete(schema.user).where(eq(schema.user.id, userId));

			console.log(`[Purge] Successfully deleted user ${userId}`);
		});
	} catch (error) {
		console.error(`[Purge] Failed to purge user ${userId}:`, error);
		throw new Response(
			"Failed to delete account. Please try again or contact support.",
			{ status: 500 },
		);
	}

	return redirect("/");
}
