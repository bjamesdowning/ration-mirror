import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { getStripe } from "~/lib/stripe.server";
import type { Route } from "./+types/billing-portal";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const {
		user: { id: userId },
	} = await requireAuth(context, request);

	const db = drizzle(context.cloudflare.env.DB, { schema });
	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: {
			stripeCustomerId: true,
		},
	});

	if (!user?.stripeCustomerId) {
		throw data({ error: "No billing account found" }, { status: 400 });
	}

	const stripe = getStripe(context.cloudflare.env);
	const session = await stripe.billingPortal.sessions.create({
		customer: user.stripeCustomerId,
		return_url: `${context.cloudflare.env.BETTER_AUTH_URL}/dashboard/settings`,
	});

	return { url: session.url };
}
