import { eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { evaluateAccountDeletionEligibility } from "~/lib/account-deletion-gate";
import { purgeCopilotConversationsForUser } from "~/lib/copilot/purge.server";
import { retryOnD1Contention } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { deleteOrganization } from "~/lib/organizations.server";
import { notifyPurgeFailure } from "~/lib/purge-failure-notify.server";
import {
	clearPurgeJob,
	clearUserPurgePending,
	markPurgeJobFailed,
	markUserPurgePending,
	putPurgeJob,
} from "~/lib/purge-pending.server";
import { deleteR2Prefix } from "~/lib/r2-cleanup.server";
import { cancelStripeSubscriptionsForCustomer } from "~/lib/stripe.server";

export interface PurgeUserInput {
	userId: string;
	email: string;
}

export class AccountDeletionBlockedError extends Error {
	readonly code = "active_subscription" as const;
	readonly eligibility: ReturnType<typeof evaluateAccountDeletionEligibility>;

	constructor(
		eligibility: ReturnType<typeof evaluateAccountDeletionEligibility>,
	) {
		super(eligibility.message);
		this.name = "AccountDeletionBlockedError";
		this.eligibility = eligibility;
	}
}

/**
 * Load user billing fields and evaluate whether account deletion is allowed.
 */
export async function assertAccountDeletionAllowed(
	env: Cloudflare.Env,
	userId: string,
): Promise<{
	email: string;
	stripeCustomerId: string | null;
	eligibility: ReturnType<typeof evaluateAccountDeletionEligibility>;
}> {
	const db = drizzle(env.DB, { schema });
	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: {
			id: true,
			email: true,
			tier: true,
			tierExpiresAt: true,
			subscriptionCancelAtPeriodEnd: true,
			stripeCustomerId: true,
		},
	});
	if (!user) {
		throw new Error("User not found");
	}

	const eligibility = evaluateAccountDeletionEligibility({
		tier: user.tier,
		tierExpiresAt: user.tierExpiresAt,
		subscriptionCancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
	});

	if (!eligibility.canDelete) {
		throw new AccountDeletionBlockedError(eligibility);
	}

	return {
		email: user.email,
		stripeCustomerId: user.stripeCustomerId ?? null,
		eligibility,
	};
}

/**
 * Cancel Stripe subscriptions while the user is still authenticated.
 * Failures surface to the client so we never lock them out with data intact.
 */
export async function cancelStripeBeforeAccountPurge(
	env: Cloudflare.Env,
	stripeCustomerId: string | null,
): Promise<void> {
	if (!stripeCustomerId || !env.STRIPE_SECRET_KEY) return;
	await cancelStripeSubscriptionsForCustomer(env, stripeCustomerId);
}

/** Immediate access cut — sessions and mobile refresh tokens. */
export async function revokeUserAccess(
	env: Cloudflare.Env,
	userId: string,
): Promise<void> {
	const db = drizzle(env.DB, { schema });
	await db.batch([
		db.delete(schema.session).where(eq(schema.session.userId, userId)),
		db
			.delete(schema.mobileRefreshToken)
			.where(eq(schema.mobileRefreshToken.userId, userId)),
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	] as [any, ...any[]]);
}

async function cancelStripeBillingBestEffort(
	env: Cloudflare.Env,
	stripeCustomerId: string | null,
): Promise<void> {
	if (!stripeCustomerId || !env.STRIPE_SECRET_KEY) return;
	try {
		await cancelStripeSubscriptionsForCustomer(env, stripeCustomerId);
	} catch (error) {
		log.error(
			"[Purge] Stripe subscription cancel (best-effort) failed",
			error,
			{
				customerId: redactId(stripeCustomerId),
			},
		);
	}
}

/**
 * Permanently deletes a user account and associated personal data.
 * Shared by web `/api/user/purge` and mobile `/api/mobile/v1/account`.
 */
export async function purgeUserAccount(
	env: Cloudflare.Env,
	{ userId, email }: PurgeUserInput,
	options?: {
		stripeCustomerId?: string | null;
		/** When true, Stripe cancel is best-effort (already attempted synchronously). */
		stripeBestEffort?: boolean;
	},
): Promise<void> {
	const db = drizzle(env.DB, { schema });
	const storage = env.STORAGE;

	log.info("[Purge] Request to delete user account", {
		userId: redactId(userId),
	});

	let stripeCustomerId = options?.stripeCustomerId ?? null;
	if (stripeCustomerId == null) {
		const row = await db.query.user.findFirst({
			where: eq(schema.user.id, userId),
			columns: { stripeCustomerId: true },
		});
		stripeCustomerId = row?.stripeCustomerId ?? null;
	}

	if (options?.stripeBestEffort !== false) {
		await cancelStripeBillingBestEffort(env, stripeCustomerId);
	}

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
			await deleteOrganization(env, orgId);
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

	await purgeCopilotConversationsForUser(env, userId);

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

/**
 * Fast path after gate + Stripe cancel: tombstone, durable job, revoke, background purge.
 */
export async function beginAccountPurge(
	env: Cloudflare.Env,
	ctx: { waitUntil: (promise: Promise<unknown>) => void },
	input: PurgeUserInput & { stripeCustomerId?: string | null },
): Promise<{ jobId: string }> {
	const jobId = crypto.randomUUID();
	await putPurgeJob(env.RATION_KV, {
		id: jobId,
		kind: "account",
		userId: input.userId,
		email: input.email,
		stripeCustomerId: input.stripeCustomerId ?? null,
	});
	await markUserPurgePending(env.RATION_KV, input.userId);
	await revokeUserAccess(env, input.userId);

	ctx.waitUntil(
		(async () => {
			try {
				await retryOnD1Contention(() =>
					purgeUserAccount(env, input, {
						stripeCustomerId: input.stripeCustomerId,
						stripeBestEffort: true,
					}),
				);
				await clearPurgeJob(env.RATION_KV, jobId);
				await clearUserPurgePending(env.RATION_KV, input.userId);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				log.error("[Purge] Background account purge failed", {
					userId: redactId(input.userId),
					jobId: redactId(jobId),
					errorMessage,
				});
				await markPurgeJobFailed(env.RATION_KV, jobId, errorMessage);
				await notifyPurgeFailure(env, {
					kind: "account",
					resourceId: `${input.userId}:${jobId}`,
					errorMessage,
				});
			}
		})(),
	);

	return { jobId };
}

/** Prefer beginAccountPurge from call sites. */
export { beginAccountPurge as scheduleAccountPurge };
