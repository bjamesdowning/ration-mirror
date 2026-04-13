import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { getFinBillingSummaryForUser } from "~/lib/fin-billing.server";
import {
	isValidFinConnectorRequest,
	parseFinUserId,
} from "~/lib/fin-connector.server";
import { log } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/fin.billing-summary";

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

	return getFinBillingSummaryForUser(context.cloudflare.env, user);
}

export async function action() {
	throw data({ error: "Method not allowed" }, { status: 405 });
}
