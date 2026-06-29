import { eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { log, redactId } from "~/lib/logging.server";
import { revokeMobileRefreshFamilies } from "~/lib/mobile/token.server";
import { deleteR2Prefix } from "~/lib/r2-cleanup.server";
import { deleteCargoVectors } from "~/lib/vector.server";

export interface PurgeUserInput {
	userId: string;
	email: string;
}

/**
 * Permanently deletes a user account and associated personal data.
 * Shared by web `/api/user/purge` and mobile `/api/mobile/v1/account`.
 */
export async function purgeUserAccount(
	env: Cloudflare.Env,
	{ userId, email }: PurgeUserInput,
): Promise<void> {
	const db = drizzle(env.DB, { schema });
	const storage = env.STORAGE;

	log.info("[Purge] Request to delete user account", {
		userId: redactId(userId),
	});

	await db
		.update(schema.session)
		.set({ activeOrganizationId: null })
		.where(eq(schema.session.userId, userId));

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
			await db
				.update(schema.session)
				.set({ activeOrganizationId: null })
				.where(eq(schema.session.activeOrganizationId, orgId));

			await db
				.delete(schema.queueJob)
				.where(eq(schema.queueJob.organizationId, orgId));

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
					.delete(schema.activeMealSelection)
					.where(eq(schema.activeMealSelection.organizationId, orgId)),
				db
					.delete(schema.supplyList)
					.where(eq(schema.supplyList.organizationId, orgId)),
				db
					.delete(schema.supplySnooze)
					.where(eq(schema.supplySnooze.organizationId, orgId)),
				db
					.delete(schema.mealPlan)
					.where(eq(schema.mealPlan.organizationId, orgId)),
				db.delete(schema.ledger).where(eq(schema.ledger.organizationId, orgId)),
				db
					.delete(schema.invitation)
					.where(eq(schema.invitation.organizationId, orgId)),
				db
					.delete(schema.agentRegistration)
					.where(eq(schema.agentRegistration.organizationId, orgId)),
				db.delete(schema.member).where(eq(schema.member.organizationId, orgId)),
				db.delete(schema.organization).where(eq(schema.organization.id, orgId)),
				// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
			] as [any, ...any[]]);

			if (storage) {
				await deleteR2Prefix(storage, `organizations/${orgId}/`);
			}
		} else {
			const newOwner =
				otherMembers.find((m) => m.role === "admin") || otherMembers[0];

			if (newOwner) {
				await db
					.update(schema.member)
					.set({ role: "owner" })
					.where(eq(schema.member.id, newOwner.id));
			}
		}
	}

	await revokeMobileRefreshFamilies(env, userId);

	await db.batch([
		db.delete(schema.member).where(eq(schema.member.userId, userId)),
		db.delete(schema.invitation).where(eq(schema.invitation.inviterId, userId)),
		db
			.delete(schema.agentRegistration)
			.where(eq(schema.agentRegistration.userId, userId)),
		db
			.update(schema.ledger)
			.set({ userId: null })
			.where(eq(schema.ledger.userId, userId)),
		db.delete(schema.apiKey).where(eq(schema.apiKey.userId, userId)),
		db
			.delete(schema.verification)
			.where(
				or(
					eq(schema.verification.identifier, email),
					like(schema.verification.identifier, `%${email}%`),
				),
			),
		db
			.delete(schema.interestSignup)
			.where(eq(schema.interestSignup.email, email)),
		db.delete(schema.session).where(eq(schema.session.userId, userId)),
		db.delete(schema.account).where(eq(schema.account.userId, userId)),
		db
			.delete(schema.mobileRefreshToken)
			.where(eq(schema.mobileRefreshToken.userId, userId)),
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	] as [any, ...any[]]);

	await db.delete(schema.user).where(eq(schema.user.id, userId));

	if (storage) {
		await deleteR2Prefix(storage, `users/${userId}/`);
	}

	log.info("[Purge] Successfully deleted user account", {
		userId: redactId(userId),
	});
}
