import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type Stripe from "stripe";
import * as schema from "~/db/schema";
import { log, redactId } from "~/lib/logging.server";
import { getStripe, isStripeNoSuchCustomerError } from "~/lib/stripe.server";

/** Stripe subscription fields used by Fin billing read + mutation paths. */
export type StripePriceWithProduct = {
	unit_amount?: number | null;
	currency?: string | null;
	nickname?: string | null;
	recurring?: { interval?: string | null } | null;
	product?: { name?: string | null } | string | null;
};

export type StripeSubscriptionShape = {
	id: string;
	status: string;
	current_period_end?: number | null;
	cancel_at_period_end?: boolean | null;
	items?: { data?: Array<{ price?: StripePriceWithProduct | null }> };
};

/** Narrow shape for Stripe subscription update responses (SDK typings may lag API fields). */
type StripeSubscriptionUpdateResult = StripeSubscriptionShape & {
	cancel_at_period_end?: boolean | null;
};

export type FinBillingUserRow = {
	id: string;
	tier: string;
	stripeCustomerId: string | null;
	subscriptionCancelAtPeriodEnd: boolean;
};

/** Response shape returned by GET billing-summary and used as baseline for mutation responses. */
export type FinBillingSummaryResult =
	| {
			hasSubscription: false;
			status: "none";
			planName: null;
			nextPaymentDate: null;
			cancelAtPeriodEnd: boolean;
			tier: string;
			interval?: null;
			amountDueMinor?: null;
			currency?: null;
	  }
	| {
			hasSubscription: true;
			status: string;
			planName: string | null;
			interval: string | null;
			nextPaymentDate: string | null;
			amountDueMinor: number | null;
			currency: string | null;
			cancelAtPeriodEnd: boolean;
			tier: string;
	  };

export function toIsoDateOrNull(
	unixSeconds: number | null | undefined,
): string | null {
	if (typeof unixSeconds !== "number" || Number.isNaN(unixSeconds)) return null;
	return new Date(unixSeconds * 1000).toISOString();
}

export function pickBestSubscription(
	subscriptions: StripeSubscriptionShape[],
): StripeSubscriptionShape | null {
	if (subscriptions.length === 0) return null;
	const score = (status: string): number => {
		switch (status) {
			case "active":
			case "trialing":
				return 4;
			case "past_due":
			case "unpaid":
				return 3;
			case "paused":
				return 2;
			default:
				return 1;
		}
	};
	return (
		[...subscriptions].sort((a, b) => score(b.status) - score(a.status))[0] ??
		null
	);
}

/** Subscriptions that can receive `cancel_at_period_end` updates in normal billing flows. */
const MUTABLE_SUBSCRIPTION_STATUSES = new Set([
	"active",
	"trialing",
	"past_due",
	"unpaid",
	"paused",
]);

export function pickBestMutableSubscription(
	subscriptions: StripeSubscriptionShape[],
): StripeSubscriptionShape | null {
	const filtered = subscriptions.filter((s) =>
		MUTABLE_SUBSCRIPTION_STATUSES.has(s.status),
	);
	return pickBestSubscription(filtered);
}

export function planNameFromSubscription(
	selected: StripeSubscriptionShape,
): string | null {
	const firstPrice = selected.items?.data?.[0]?.price ?? null;
	return (
		firstPrice?.nickname ??
		(typeof firstPrice?.product === "object"
			? firstPrice.product?.name
			: null) ??
		null
	);
}

export function intervalFromSubscription(
	selected: StripeSubscriptionShape,
): string | null {
	const firstPrice = selected.items?.data?.[0]?.price ?? null;
	return firstPrice?.recurring?.interval ?? null;
}

/**
 * Fin billing read: Stripe customer subscriptions + optional invoice preview.
 * Caller must have already validated auth and loaded `user`.
 */
export async function getFinBillingSummaryForUser(
	env: Env,
	user: FinBillingUserRow,
): Promise<FinBillingSummaryResult> {
	if (!user.stripeCustomerId) {
		return {
			hasSubscription: false,
			status: "none",
			planName: null,
			nextPaymentDate: null,
			cancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
			tier: user.tier,
		};
	}

	const stripe = getStripe(env);
	try {
		const listed = await stripe.subscriptions.list({
			customer: user.stripeCustomerId,
			status: "all",
			limit: 5,
		});
		const selected = pickBestSubscription(
			listed.data as unknown as StripeSubscriptionShape[],
		);

		if (!selected) {
			return {
				hasSubscription: false,
				status: "none",
				planName: null,
				nextPaymentDate: null,
				cancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
				tier: user.tier,
			};
		}

		const planName = planNameFromSubscription(selected);
		const interval = intervalFromSubscription(selected);

		let nextPaymentDate = toIsoDateOrNull(selected.current_period_end);
		let amountDueMinor: number | null =
			selected.items?.data?.[0]?.price?.unit_amount ?? null;
		let currency: string | null =
			selected.items?.data?.[0]?.price?.currency?.toUpperCase() ?? null;
		try {
			const upcoming = await stripe.invoices.createPreview({
				customer: user.stripeCustomerId,
				subscription: selected.id,
			});
			const upcomingNextPayment =
				(upcoming as unknown as { next_payment_attempt?: number | null })
					.next_payment_attempt ?? null;
			nextPaymentDate =
				toIsoDateOrNull(upcomingNextPayment) ??
				toIsoDateOrNull(upcoming.due_date) ??
				toIsoDateOrNull(
					(upcoming as unknown as { period_end?: number | null }).period_end,
				) ??
				nextPaymentDate;
			amountDueMinor = upcoming.amount_due;
			currency = upcoming.currency.toUpperCase();
		} catch (previewError) {
			log.warn(
				"Fin billing: invoice preview unavailable, using subscription fallback",
				{
					userId: redactId(user.id),
					subscriptionId: redactId(selected.id),
					errorCode:
						(previewError as { code?: string })?.code ??
						(previewError instanceof Error
							? previewError.message
							: String(previewError)),
				},
			);
		}

		return {
			hasSubscription: true,
			status: selected.status,
			planName,
			interval,
			nextPaymentDate,
			amountDueMinor,
			currency,
			cancelAtPeriodEnd:
				selected.cancel_at_period_end === true ||
				user.subscriptionCancelAtPeriodEnd,
			tier: user.tier,
		};
	} catch (error) {
		if (isStripeNoSuchCustomerError(error)) {
			log.warn("Fin billing lookup missing Stripe customer", {
				userId: redactId(user.id),
				stripeCustomerId: redactId(user.stripeCustomerId),
			});
			return {
				hasSubscription: false,
				status: "none",
				planName: null,
				nextPaymentDate: null,
				cancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
				tier: user.tier,
			};
		}
		throw error;
	}
}

export type FinSubscriptionMutationActionTaken =
	| "canceled"
	| "resumed"
	| "already_canceled"
	| "already_active"
	| "no_subscription";

export type FinSubscriptionMutationResult = {
	hasSubscription: boolean;
	status: string;
	planName: string | null;
	interval: string | null;
	cancelAtPeriodEnd: boolean;
	effectiveEndDate: string | null;
	nextPaymentDate: string | null;
	actionTaken: FinSubscriptionMutationActionTaken;
	message: string;
	tier: string;
};

function mutationBaseFromSubscription(
	user: FinBillingUserRow,
	selected: StripeSubscriptionShape,
): Omit<
	FinSubscriptionMutationResult,
	"actionTaken" | "message" | "effectiveEndDate" | "nextPaymentDate"
> & {
	effectiveEndDate: string | null;
	nextPaymentDate: string | null;
} {
	const planName = planNameFromSubscription(selected);
	const interval = intervalFromSubscription(selected);
	const periodEnd = toIsoDateOrNull(selected.current_period_end);
	return {
		hasSubscription: true,
		status: selected.status,
		planName,
		interval,
		cancelAtPeriodEnd: selected.cancel_at_period_end === true,
		effectiveEndDate: periodEnd,
		nextPaymentDate: periodEnd,
		tier: user.tier,
	};
}

/**
 * List subscriptions for Fin mutation paths (cancel/resume). Does not run invoice preview.
 */
export async function listFinCustomerSubscriptions(
	stripe: Stripe,
	stripeCustomerId: string,
): Promise<StripeSubscriptionShape[]> {
	const listed = await stripe.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
		limit: 5,
	});
	return listed.data as unknown as StripeSubscriptionShape[];
}

export function buildFinIdempotencyKey(
	action: "cancel" | "resume",
	userId: string,
	subscriptionId: string,
	targetCancelAtPeriodEnd: boolean,
): string {
	const raw = `fin_${action}:${userId}:${subscriptionId}:${targetCancelAtPeriodEnd ? "1" : "0"}`;
	return raw.length > 255 ? raw.slice(0, 255) : raw;
}

/**
 * Set Stripe `cancel_at_period_end` and return a Fin-safe mutation result.
 * Updates D1 `subscriptionCancelAtPeriodEnd` after a successful Stripe call.
 */
export async function finSetSubscriptionCancelAtPeriodEnd(args: {
	env: Env;
	db: DrizzleD1Database<typeof schema>;
	user: FinBillingUserRow;
	wantCancelAtPeriodEnd: boolean;
}): Promise<FinSubscriptionMutationResult> {
	const { env, db, user, wantCancelAtPeriodEnd } = args;

	if (!user.stripeCustomerId) {
		return {
			hasSubscription: false,
			status: "none",
			planName: null,
			interval: null,
			cancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
			effectiveEndDate: null,
			nextPaymentDate: null,
			actionTaken: "no_subscription",
			message:
				"No billing account is on file. Subscribe from Hub → Pricing if you want Crew Member.",
			tier: user.tier,
		};
	}

	const stripe = getStripe(env);
	let subscriptions: StripeSubscriptionShape[];
	try {
		subscriptions = await listFinCustomerSubscriptions(
			stripe,
			user.stripeCustomerId,
		);
	} catch (error) {
		if (isStripeNoSuchCustomerError(error)) {
			log.warn("Fin subscription mutation: missing Stripe customer", {
				userId: redactId(user.id),
				stripeCustomerId: redactId(user.stripeCustomerId),
			});
			return {
				hasSubscription: false,
				status: "none",
				planName: null,
				interval: null,
				cancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
				effectiveEndDate: null,
				nextPaymentDate: null,
				actionTaken: "no_subscription",
				message:
					"No active subscription was found for this account. You can subscribe from Hub → Pricing.",
				tier: user.tier,
			};
		}
		throw error;
	}

	const selected = pickBestMutableSubscription(subscriptions);
	if (!selected) {
		return {
			hasSubscription: false,
			status: "none",
			planName: null,
			interval: null,
			cancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
			effectiveEndDate: null,
			nextPaymentDate: null,
			actionTaken: "no_subscription",
			message:
				"There is no active subscription to change. If you expected Crew Member, check Hub → Pricing or your billing portal.",
			tier: user.tier,
		};
	}

	const base = mutationBaseFromSubscription(user, selected);

	if (wantCancelAtPeriodEnd) {
		if (selected.cancel_at_period_end === true) {
			if (!user.subscriptionCancelAtPeriodEnd) {
				await db
					.update(schema.user)
					.set({ subscriptionCancelAtPeriodEnd: true })
					.where(eq(schema.user.id, user.id));
			}
			return {
				...base,
				cancelAtPeriodEnd: true,
				actionTaken: "already_canceled",
				message:
					"Your subscription is already set to cancel at the end of the current billing period. You keep access until that date.",
			};
		}
		const idempotencyKey = buildFinIdempotencyKey(
			"cancel",
			user.id,
			selected.id,
			true,
		);
		const updated = (await stripe.subscriptions.update(
			selected.id,
			{ cancel_at_period_end: true },
			{ idempotencyKey },
		)) as unknown as StripeSubscriptionUpdateResult;
		const cancelAtEnd = updated.cancel_at_period_end === true;
		await db
			.update(schema.user)
			.set({ subscriptionCancelAtPeriodEnd: cancelAtEnd })
			.where(eq(schema.user.id, user.id));

		const periodEnd = toIsoDateOrNull(updated.current_period_end);
		const planName = planNameFromSubscription(
			updated as unknown as StripeSubscriptionShape,
		);
		return {
			hasSubscription: true,
			status: updated.status,
			planName,
			interval: intervalFromSubscription(
				updated as unknown as StripeSubscriptionShape,
			),
			cancelAtPeriodEnd: cancelAtEnd,
			effectiveEndDate: periodEnd,
			nextPaymentDate: periodEnd,
			actionTaken: "canceled",
			message:
				"Your subscription is set to cancel at the end of the current billing period. You retain Crew Member access until then. You can resume before that date if you change your mind.",
			tier: user.tier,
		};
	}

	// Resume: clear cancel_at_period_end
	if (selected.cancel_at_period_end !== true) {
		if (user.subscriptionCancelAtPeriodEnd) {
			await db
				.update(schema.user)
				.set({ subscriptionCancelAtPeriodEnd: false })
				.where(eq(schema.user.id, user.id));
		}
		return {
			...base,
			cancelAtPeriodEnd: false,
			actionTaken: "already_active",
			message:
				"Your subscription is already active and not scheduled to cancel.",
		};
	}

	const idempotencyKey = buildFinIdempotencyKey(
		"resume",
		user.id,
		selected.id,
		false,
	);
	const updated = (await stripe.subscriptions.update(
		selected.id,
		{ cancel_at_period_end: false },
		{ idempotencyKey },
	)) as unknown as StripeSubscriptionUpdateResult;
	const cancelAtEnd = updated.cancel_at_period_end === true;
	await db
		.update(schema.user)
		.set({ subscriptionCancelAtPeriodEnd: cancelAtEnd })
		.where(eq(schema.user.id, user.id));

	const periodEnd = toIsoDateOrNull(updated.current_period_end);
	const planName = planNameFromSubscription(
		updated as unknown as StripeSubscriptionShape,
	);
	return {
		hasSubscription: true,
		status: updated.status,
		planName,
		interval: intervalFromSubscription(
			updated as unknown as StripeSubscriptionShape,
		),
		cancelAtPeriodEnd: cancelAtEnd,
		effectiveEndDate: periodEnd,
		nextPaymentDate: periodEnd,
		actionTaken: "resumed",
		message:
			"Your subscription will continue and renew as usual. Pending cancellation has been removed.",
		tier: user.tier,
	};
}
