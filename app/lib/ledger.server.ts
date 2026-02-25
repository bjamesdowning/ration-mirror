import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { log, redactId } from "./logging.server";
import { getStripe } from "./stripe.server";

// ---------------------------------------------------------------------------
// Cost Registry
// ---------------------------------------------------------------------------
// Centralised cost map for every credit-consuming operation. Add new entries
// here when new AI features are introduced so pricing stays in one place.
// Route mapping: SCAN -> /api/scan, MEAL_GENERATE -> /api/meals/generate,
// IMPORT_URL -> /api/meals/import. ORGANIZE_CARGO and MEAL_PLAN_WEEKLY: not yet implemented.
export const AI_COSTS = {
	SCAN: 2,
	MEAL_GENERATE: 2,
	IMPORT_URL: 1,
	ORGANIZE_CARGO: 2,
	MEAL_PLAN_WEEKLY: 3,
} as const;

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------
export class InsufficientCreditsError extends Error {
	override name = "InsufficientCreditsError" as const;
	required: number;
	current?: number;

	constructor(required: number, current?: number) {
		super("Insufficient credits");
		this.required = required;
		this.current = current;
	}
}

// ---------------------------------------------------------------------------
// Balance Read
// ---------------------------------------------------------------------------
export async function checkBalance(
	env: Env,
	organizationId: string,
): Promise<number> {
	const db = drizzle(env.DB, { schema });

	const org = await db.query.organization.findFirst({
		where: (org, { eq }) => eq(org.id, organizationId),
		columns: {
			credits: true,
		},
	});

	return org?.credits ?? 0;
}

// ---------------------------------------------------------------------------
// Atomic Deduction
// ---------------------------------------------------------------------------
// Uses D1 batch (transactional) to guarantee the balance UPDATE and ledger
// INSERT either both commit or both roll back. The UPDATE uses a
// `WHERE credits >= cost` guard to prevent overdraft, and RETURNING to
// verify it actually matched. If no rows are returned, an orphaned ledger
// entry may exist within the same transaction; it is cleaned up immediately.
export async function deductCredits(
	env: Env,
	organizationId: string,
	userId: string,
	cost: number,
	reason: string,
) {
	if (cost <= 0) {
		throw new Error("Cost must be positive");
	}

	const ledgerId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);

	// D1 batch executes all statements in a single transaction.
	const batchResults = await env.DB.batch([
		env.DB.prepare(
			`UPDATE organization
			SET credits = credits - ?1
			WHERE id = ?2 AND credits >= ?1
			RETURNING id;`,
		).bind(cost, organizationId),
		env.DB.prepare(
			`INSERT INTO ledger (id, organization_id, user_id, amount, reason, created_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6);`,
		).bind(ledgerId, organizationId, userId, -cost, reason, now),
	]);

	// Verify the UPDATE matched at least one row (sufficient credits).
	const updateResult = batchResults[0];
	if (!updateResult.results || updateResult.results.length === 0) {
		// Race condition: balance was insufficient despite a possible pre-flight
		// check passing. The INSERT committed an orphaned ledger entry; remove it.
		await env.DB.prepare("DELETE FROM ledger WHERE id = ?1;")
			.bind(ledgerId)
			.run();
		throw new InsufficientCreditsError(cost);
	}
}

// ---------------------------------------------------------------------------
// Credit Addition (Purchases & Refunds)
// ---------------------------------------------------------------------------
export async function addCredits(
	env: Env,
	organizationId: string,
	userId: string | null,
	amount: number,
	reason: string,
	metadata?: { sessionId?: string },
) {
	if (amount <= 0) {
		throw new Error("Amount must be positive");
	}

	const db = drizzle(env.DB, { schema });

	// 1. Idempotency guard for Stripe fulfillment (keyed on sessionId)
	if (metadata?.sessionId) {
		const existing = await db.query.ledger.findFirst({
			where: (ledger, { and, eq }) =>
				and(
					eq(ledger.organizationId, organizationId),
					eq(ledger.reason, `${reason}:${metadata.sessionId}`),
				),
		});

		if (existing) {
			log.warn("Duplicate credit add attempt for Stripe session", {
				sessionId: metadata.sessionId,
			});
			return;
		}
	}

	// 2. Ledger reason (include sessionId for idempotency when present)
	const ledgerReason = metadata?.sessionId
		? `${reason}:${metadata.sessionId}`
		: reason;

	// 3. Atomic balance + ledger write via D1 batch
	await db.batch([
		db
			.update(schema.organization)
			.set({ credits: sql`${schema.organization.credits} + ${amount}` })
			.where(eq(schema.organization.id, organizationId)),
		db.insert(schema.ledger).values({
			organizationId,
			userId,
			amount,
			reason: ledgerReason,
		}),
	]);
}

// ---------------------------------------------------------------------------
// Credit Transfer Between Groups
// ---------------------------------------------------------------------------
// Atomically deducts from source org and adds to destination org. Owner-only
// for source; destination can be any group the user is a member of.
export async function transferCredits(
	env: Env,
	sourceOrganizationId: string,
	destinationOrganizationId: string,
	userId: string,
	amount: number,
) {
	if (amount <= 0) {
		throw new Error("Amount must be positive");
	}
	if (sourceOrganizationId === destinationOrganizationId) {
		throw new Error("Source and destination must differ");
	}

	const ledgerIdSource = crypto.randomUUID();
	const ledgerIdDest = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);

	const batchResults = await env.DB.batch([
		env.DB.prepare(
			`UPDATE organization
			SET credits = credits - ?1
			WHERE id = ?2 AND credits >= ?1
			RETURNING id;`,
		).bind(amount, sourceOrganizationId),
		env.DB.prepare(
			`UPDATE organization
			SET credits = credits + ?1
			WHERE id = ?2;`,
		).bind(amount, destinationOrganizationId),
		env.DB.prepare(
			`INSERT INTO ledger (id, organization_id, user_id, amount, reason, created_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6);`,
		).bind(
			ledgerIdSource,
			sourceOrganizationId,
			userId,
			-amount,
			`Transfer Out: ${destinationOrganizationId}`,
			now,
		),
		env.DB.prepare(
			`INSERT INTO ledger (id, organization_id, user_id, amount, reason, created_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6);`,
		).bind(
			ledgerIdDest,
			destinationOrganizationId,
			userId,
			amount,
			`Transfer In: ${sourceOrganizationId}`,
			now,
		),
	]);

	const sourceUpdateResult = batchResults[0];
	if (!sourceUpdateResult.results || sourceUpdateResult.results.length === 0) {
		// Source had insufficient credits; batch committed dest + ledger. Reverse.
		await env.DB.batch([
			env.DB.prepare(
				`UPDATE organization SET credits = credits - ?1 WHERE id = ?2;`,
			).bind(amount, destinationOrganizationId),
			env.DB.prepare("DELETE FROM ledger WHERE id = ?1;").bind(ledgerIdSource),
			env.DB.prepare("DELETE FROM ledger WHERE id = ?1;").bind(ledgerIdDest),
		]);
		throw new InsufficientCreditsError(amount);
	}
}

// ---------------------------------------------------------------------------
// Credit Gate  (the primary interface for AI feature routes)
// ---------------------------------------------------------------------------
// Wraps any credit-consuming operation with:
//   1. Pre-flight balance check  (fast-fail UX, avoids unnecessary work)
//   2. Atomic deduction           (overdraft-safe via SQL guard)
//   3. Operation execution
//   4. Automatic refund on error  (user receives credits back if they got
//      no usable result -- deliberate product decision)
//
// Refund policy: every thrown error triggers a refund because the user did
// not receive the value they paid for. Infrastructure failures, AI timeouts,
// and malformed responses all fall into this bucket. If a future feature
// needs "consume on attempt" semantics, the operation should return a result
// (even a partial one) instead of throwing.
export async function withCreditGate<T>(
	options: {
		env: Env;
		organizationId: string;
		userId: string;
		cost: number;
		reason: string;
	},
	operation: () => Promise<T>,
): Promise<T> {
	const { env, organizationId, userId, cost, reason } = options;

	// 1. Pre-flight balance check (cheap read, saves an unnecessary batch)
	const balance = await checkBalance(env, organizationId);
	if (balance < cost) {
		throw new InsufficientCreditsError(cost, balance);
	}

	// 2. Atomic deduction (may still throw InsufficientCreditsError on race)
	await deductCredits(env, organizationId, userId, cost, reason);

	// 3. Execute the billable operation
	try {
		return await operation();
	} catch (error) {
		// 4. Refund -- the user got nothing of value
		try {
			await addCredits(env, organizationId, userId, cost, `Refund: ${reason}`);
		} catch (refundError) {
			// CRITICAL: Balance debited but refund failed. Log enough context for
			// manual reconciliation without exposing PII (IDs are UUIDs, not PII).
			log.critical("Credit refund failed", refundError, {
				organizationId,
				amount: cost,
				reason,
			});
		}
		throw error;
	}
}

// ---------------------------------------------------------------------------
// Stripe Checkout Fulfillment
// ---------------------------------------------------------------------------
export async function processCheckoutSession(env: Env, sessionId: string) {
	const stripe = getStripe(env);

	// 1. Fetch session from Stripe to verify status
	const session = await stripe.checkout.sessions.retrieve(sessionId);

	if (session.payment_status !== "paid") {
		throw new Error(`Session ${sessionId} is not paid`);
	}

	const checkoutType = session.metadata?.type ?? "credits";
	if (checkoutType !== "credits") {
		return {
			success: true,
			userId: session.metadata?.userId ?? null,
			organizationId: session.metadata?.organizationId ?? null,
			credits: 0,
		};
	}

	// 2. Extract metadata
	const userId = session.metadata?.userId; // Who made the purchase
	const organizationId = session.metadata?.organizationId; // Who gets the credits
	const creditsStr = session.metadata?.credits;

	if (!organizationId || !creditsStr) {
		throw new Error(`Session ${sessionId} missing metadata`);
	}

	const credits = Number.parseInt(creditsStr, 10);

	if (userId && typeof session.customer === "string") {
		const db = drizzle(env.DB, { schema });
		await db
			.update(schema.user)
			.set({ stripeCustomerId: session.customer })
			.where(eq(schema.user.id, userId));
	}

	// 3. Fulfill credits (Idempotent)
	await addCredits(
		env,
		organizationId,
		userId || null,
		credits,
		"Stripe Purchase",
		{
			sessionId: session.id,
		},
	);

	return {
		success: true,
		userId,
		organizationId,
		credits,
	};
}

export async function processSubscriptionCheckoutSession(
	env: Env,
	sessionId: string,
) {
	const stripe = getStripe(env);
	const session = await stripe.checkout.sessions.retrieve(sessionId);
	const subscriptionId = session.subscription;
	if (!subscriptionId || typeof subscriptionId !== "string") {
		throw new Error(`Session ${sessionId} is missing subscription`);
	}

	const subscription = await stripe.subscriptions.retrieve(subscriptionId);
	const userId = subscription.metadata?.userId ?? session.metadata?.userId;
	const organizationId =
		subscription.metadata?.organizationId ?? session.metadata?.organizationId;

	if (!userId || !organizationId) {
		throw new Error(`Subscription ${subscriptionId} missing metadata`);
	}

	// Since API version 2025-03-31.basil, current_period_end lives on
	// subscription items, not the subscription itself.
	const sub = subscription as unknown as {
		current_period_end?: number;
		items?: { data?: Array<{ current_period_end?: number }> };
	};
	const currentPeriodEnd =
		sub.items?.data?.[0]?.current_period_end ??
		sub.current_period_end ??
		Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
	const periodEnd = new Date(currentPeriodEnd * 1000);
	const db = drizzle(env.DB, { schema });

	const updatePayload: {
		tier: "crew_member";
		tierExpiresAt: Date;
		stripeCustomerId?: string;
	} = {
		tier: "crew_member",
		tierExpiresAt: periodEnd,
	};
	if (typeof session.customer === "string") {
		updatePayload.stripeCustomerId = session.customer;
	}

	await db
		.update(schema.user)
		.set(updatePayload)
		.where(eq(schema.user.id, userId));

	log.info("Tier updated to crew_member", {
		userId: redactId(userId),
		organizationId: redactId(organizationId),
		periodEnd: periodEnd.toISOString(),
	});

	await addCredits(env, organizationId, userId, 60, "Crew Member Credits", {
		sessionId,
	});

	return { userId, organizationId, periodEnd };
}

export async function processSubscriptionInvoice(
	env: Env,
	subscriptionId: string,
	invoiceId: string,
) {
	const stripe = getStripe(env);
	const subscription = await stripe.subscriptions.retrieve(subscriptionId);
	const userId = subscription.metadata?.userId;
	const organizationId = subscription.metadata?.organizationId;

	if (!userId || !organizationId) {
		throw new Error(`Subscription ${subscriptionId} missing metadata`);
	}

	const sub = subscription as unknown as {
		current_period_end?: number;
		items?: { data?: Array<{ current_period_end?: number }> };
	};
	const currentPeriodEnd =
		sub.items?.data?.[0]?.current_period_end ??
		sub.current_period_end ??
		Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
	const periodEnd = new Date(currentPeriodEnd * 1000);
	const db = drizzle(env.DB, { schema });
	await db
		.update(schema.user)
		.set({
			tier: "crew_member",
			tierExpiresAt: periodEnd,
		})
		.where(eq(schema.user.id, userId));

	await addCredits(
		env,
		organizationId,
		userId,
		60,
		"Crew Member Renewal Credits",
		{ sessionId: invoiceId },
	);

	return { userId, organizationId, periodEnd };
}

export async function downgradeExpiredSubscription(
	env: Env,
	subscriptionId: string,
) {
	const stripe = getStripe(env);
	const subscription = await stripe.subscriptions.retrieve(subscriptionId);
	const userId = subscription.metadata?.userId;

	if (!userId) {
		throw new Error(`Subscription ${subscriptionId} missing user metadata`);
	}

	const db = drizzle(env.DB, { schema });
	await db
		.update(schema.user)
		.set({
			tier: "free",
			tierExpiresAt: null,
		})
		.where(eq(schema.user.id, userId));

	return { userId };
}
