import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data, redirect } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { log, redactId } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { deleteCargoVectors } from "~/lib/vector.server";
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

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"user_purge",
		userId,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Account deletion is rate limited. Please try again later." },
			{ status: 429, headers: { "Retry-After": "300" } },
		);
	}

	const env = context.cloudflare.env;
	const db = drizzle(env.DB, { schema });
	const storage = env.STORAGE;

	log.info("[Purge] Request to delete user account", {
		userId: redactId(userId),
	});

	try {
		// D1 does not support traditional SQL transactions (BEGIN/COMMIT) via Drizzle's db.transaction.
		// We use sequential execution.

		// 1. Clear activeOrganizationId for all the user's sessions first
		log.info("[Purge] 1. Clearing session org references...");
		await db
			.update(schema.session)
			.set({ activeOrganizationId: null })
			.where(eq(schema.session.userId, userId));

		// 2. Handle Organizations Owned by User
		log.info("[Purge] 2. Checking owned organizations...");
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
				log.info("[Purge] Deleting sole-owned organization", {
					orgId: redactId(orgId),
				});
				// Clear activeOrganizationId for ALL users if this org is about to be deleted
				await db
					.update(schema.session)
					.set({ activeOrganizationId: null })
					.where(eq(schema.session.activeOrganizationId, orgId));

				// Manual cleanup of data — delete cargo vectors before D1
				const orgCargoRows = await db
					.select({ id: schema.cargo.id })
					.from(schema.cargo)
					.where(eq(schema.cargo.organizationId, orgId));
				const orgCargoIds = orgCargoRows.map((r) => r.id);
				if (orgCargoIds.length > 0) {
					await deleteCargoVectors(env, orgCargoIds);
				}

				await db.batch([
					db.delete(schema.cargo).where(eq(schema.cargo.organizationId, orgId)),
					db.delete(schema.meal).where(eq(schema.meal.organizationId, orgId)),
					db
						.delete(schema.supplyList)
						.where(eq(schema.supplyList.organizationId, orgId)),
					db
						.delete(schema.ledger)
						.where(eq(schema.ledger.organizationId, orgId)),
					db
						.delete(schema.invitation)
						.where(eq(schema.invitation.organizationId, orgId)),
					db
						.delete(schema.member)
						.where(eq(schema.member.organizationId, orgId)),
					db
						.delete(schema.organization)
						.where(eq(schema.organization.id, orgId)),
					// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
				] as [any, ...any[]]);
				log.info("[Purge] Deleted owned organization", {
					orgId: redactId(orgId),
				});

				if (storage) {
					await deleteR2Prefix(storage, `organizations/${orgId}/`);
				}
			} else {
				log.info("[Purge] Transferring ownership of shared organization", {
					orgId: redactId(orgId),
				});
				const newOwner =
					otherMembers.find((m) => m.role === "admin") || otherMembers[0];

				if (newOwner) {
					await db
						.update(schema.member)
						.set({ role: "owner" })
						.where(eq(schema.member.id, newOwner.id));
					log.info("[Purge] Transferred org ownership", {
						orgId: redactId(orgId),
						newOwnerId: redactId(newOwner.userId),
					});
				}
			}
		}

		// 3–6. Delete memberships, invitations, sessions, accounts; anonymize ledger
		log.info(
			"[Purge] 3-6. Deleting user memberships, invitations, sessions, accounts...",
		);
		await db.batch([
			db.delete(schema.member).where(eq(schema.member.userId, userId)),
			db
				.delete(schema.invitation)
				.where(eq(schema.invitation.inviterId, userId)),
			db
				.update(schema.ledger)
				.set({ userId: null })
				.where(eq(schema.ledger.userId, userId)),
			db.delete(schema.session).where(eq(schema.session.userId, userId)),
			db.delete(schema.account).where(eq(schema.account.userId, userId)),
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		] as [any, ...any[]]);

		// 7. Finally delete the User
		log.info("[Purge] 7. Deleting user record...");
		await db.delete(schema.user).where(eq(schema.user.id, userId));

		// 8. Delete user assets (R2)
		if (storage) {
			await deleteR2Prefix(storage, `users/${userId}/`);
		}

		log.info("[Purge] Successfully deleted user account", {
			userId: redactId(userId),
		});
	} catch (error) {
		log.error("[Purge] FATAL Error during user purge", error, {
			userId: redactId(userId),
		});
		throw data(
			{
				error:
					"Account deletion failed. Please try again later or contact support.",
			},
			{ status: 500 },
		);
	}

	return redirect("/");
}
