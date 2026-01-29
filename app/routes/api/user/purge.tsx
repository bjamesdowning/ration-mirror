import { and, eq } from "drizzle-orm";
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

			// 1. Find all organizations user owns
			const ownedMemberships = await tx
				.select()
				.from(schema.member)
				.where(
					and(
						eq(schema.member.userId, userId),
						eq(schema.member.role, "owner"),
					),
				);

			console.log(`[Purge] User owns ${ownedMemberships.length} organizations`);

			// 2. Handle each owned organization
			for (const membership of ownedMemberships) {
				const org = await tx.query.organization.findFirst({
					where: eq(schema.organization.id, membership.organizationId),
				});

				if (!org) {
					console.warn(
						`[Purge] Organization ${membership.organizationId} not found`,
					);
					continue;
				}

				// Check if personal organization
				const metadata = org.metadata as { isPersonal?: boolean } | null;
				const isPersonal = metadata?.isPersonal === true;

				if (isPersonal) {
					// Delete personal organization (cascades delete its data via FK constraints)
					await tx
						.delete(schema.organization)
						.where(eq(schema.organization.id, org.id));

					console.log(
						`[Purge] Deleted personal organization: ${org.id} (${org.name})`,
					);
				} else {
					// For shared organizations, count other members
					const allMembers = await tx
						.select()
						.from(schema.member)
						.where(eq(schema.member.organizationId, org.id));

					const otherMembers = allMembers.filter((m) => m.userId !== userId);

					if (otherMembers.length === 0) {
						// Last member - delete the organization
						await tx
							.delete(schema.organization)
							.where(eq(schema.organization.id, org.id));

						console.log(
							`[Purge] Deleted empty shared organization: ${org.id} (${org.name})`,
						);
					} else {
						// Transfer ownership to next admin, or first member if no admin
						const nextOwnerCandidate =
							otherMembers.find((m) => m.role === "admin") || otherMembers[0];

						if (nextOwnerCandidate) {
							await tx
								.update(schema.member)
								.set({ role: "owner" })
								.where(eq(schema.member.id, nextOwnerCandidate.id));

							console.log(
								`[Purge] Transferred ownership of ${org.id} (${org.name}) to user ${nextOwnerCandidate.userId}`,
							);
						}
					}
				}
			}

			// 3. Remove user from all other memberships (where not owner)
			await tx.delete(schema.member).where(eq(schema.member.userId, userId));

			console.log(`[Purge] Removed all memberships for user ${userId}`);

			// 4. Clean up ledger entries where user is tracked (nullable, so OK to have orphaned entries)
			// Note: We don't delete ledger entries, just remove the user reference
			// This maintains audit trail while anonymizing the user
			await tx
				.update(schema.ledger)
				.set({ userId: null })
				.where(eq(schema.ledger.userId, userId));

			console.log(`[Purge] Anonymized ledger entries for user ${userId}`);

			// 5. Delete invitations created by this user
			await tx
				.delete(schema.invitation)
				.where(eq(schema.invitation.inviterId, userId));

			console.log(`[Purge] Deleted invitations created by user ${userId}`);

			// 6. Delete auth-related data (sessions, accounts, user)
			await tx.delete(schema.session).where(eq(schema.session.userId, userId));
			await tx.delete(schema.account).where(eq(schema.account.userId, userId));
			await tx.delete(schema.user).where(eq(schema.user.id, userId));

			console.log(
				`[Purge] Successfully purged user ${userId} and all associated data`,
			);
		});
	} catch (error) {
		console.error(`[Purge] Failed to purge user ${userId}:`, error);
		throw new Response(
			"Failed to delete account. Please try again or contact support.",
			{
				status: 500,
			},
		);
	}

	// User deleted successfully - redirect to homepage
	return redirect("/");
}
