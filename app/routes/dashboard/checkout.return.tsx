import { redirect } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { log } from "~/lib/logging.server";
import type { Route } from "./+types/checkout.return";

export async function loader(args: Route.LoaderArgs) {
	await requireActiveGroup(args.context, args.request);

	const url = new URL(args.request.url);
	const sessionId = url.searchParams.get("session_id");

	if (!sessionId) {
		return redirect("/dashboard/settings");
	}

	const env = args.context.cloudflare.env;

	try {
		const { processCheckoutSession, processSubscriptionCheckoutSession } =
			await import("~/lib/ledger.server");
		const { getStripe } = await import("~/lib/stripe.server");

		const stripe = getStripe(env);
		const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
		const checkoutType = stripeSession.metadata?.type ?? "credits";

		if (checkoutType === "subscription") {
			await processSubscriptionCheckoutSession(env, sessionId);
		} else {
			await processCheckoutSession(env, sessionId);
		}

		return redirect("/dashboard/settings?transaction=success");
	} catch (error) {
		log.error("Checkout return fulfillment failed", error);
		return redirect("/dashboard/settings?transaction=failed");
	}
}

export default function CheckoutReturn() {
	return null;
}
