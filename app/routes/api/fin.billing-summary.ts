import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import {
	isValidFinConnectorRequest,
	parseFinUserId,
} from "~/lib/fin-connector.server";
import { log, redactId } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { getStripe, isStripeNoSuchCustomerError } from "~/lib/stripe.server";
import type { Route } from "./+types/fin.billing-summary";

type StripePriceWithProduct = {
	unit_amount?: number | null;
	currency?: string;
	nickname?: string | null;
	recurring?: { interval?: string | null } | null;
	product?: { name?: string | null } | string | null;
};

type StripeSubscriptionShape = {
	id: string;
	status: string;
	current_period_end?: number | null;
	cancel_at_period_end?: boolean | null;
	items?: { data?: Array<{ price?: StripePriceWithProduct | null }> };
};

function toIsoDateOrNull(
	unixSeconds: number | null | undefined,
): string | null {
	if (typeof unixSeconds !== "number" || Number.isNaN(unixSeconds)) return null;
	return new Date(unixSeconds * 1000).toISOString();
}

function pickBestSubscription(
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
		subscriptions.sort((a, b) => score(b.status) - score(a.status))[0] ?? null
	);
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const configured = context.cloudflare.env.FIN_INTERCOM_CONNECTOR_SECRET;
	if (!configured) {
		log.error("Fin billing connector secret missing");
		throw data({ error: "Service not configured" }, { status: 503 });
	}

	if (!isValidFinConnectorRequest(request.headers, configured)) {
		throw data({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const userId = parseFinUserId(url.searchParams.get("user_id"));
	if (!userId) {
		throw data({ error: "Missing or invalid user_id" }, { status: 400 });
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"fin_billing",
		userId,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many requests",
				retryAfter: rateLimitResult.retryAfter,
				resetAt: rateLimitResult.resetAt,
			},
			{
				status: 429,
				headers: {
					"Retry-After": String(rateLimitResult.retryAfter ?? 60),
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": String(rateLimitResult.resetAt),
				},
			},
		);
	}

	const db = drizzle(context.cloudflare.env.DB, { schema });
	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: {
			id: true,
			tier: true,
			stripeCustomerId: true,
			subscriptionCancelAtPeriodEnd: true,
		},
	});

	if (!user) {
		throw data({ error: "User not found" }, { status: 404 });
	}

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

	const stripe = getStripe(context.cloudflare.env);
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

		const firstPrice = selected.items?.data?.[0]?.price ?? null;
		const planName =
			firstPrice?.nickname ??
			(typeof firstPrice?.product === "object"
				? firstPrice.product?.name
				: null) ??
			null;

		let nextPaymentDate = toIsoDateOrNull(selected.current_period_end);
		let amountDueMinor: number | null = firstPrice?.unit_amount ?? null;
		let currency: string | null = firstPrice?.currency?.toUpperCase() ?? null;
		try {
			const upcoming = await stripe.invoices.createPreview({
				customer: user.stripeCustomerId,
				subscription: selected.id,
			});
			nextPaymentDate = toIsoDateOrNull(upcoming.due_date) ?? nextPaymentDate;
			amountDueMinor = upcoming.amount_due;
			currency = upcoming.currency.toUpperCase();
		} catch {
			// Upcoming invoices are not guaranteed (e.g. canceled or incomplete subscriptions).
		}

		return {
			hasSubscription: true,
			status: selected.status,
			planName,
			interval: firstPrice?.recurring?.interval ?? null,
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

export async function action() {
	throw data({ error: "Method not allowed" }, { status: 405 });
}
