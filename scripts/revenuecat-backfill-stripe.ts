/**
 * One-time backfill: post active Stripe subscriptions into RevenueCat.
 *
 * Usage (requires production secrets in environment):
 *   REVENUECAT_STRIPE_PUBLIC_API_KEY=... STRIPE_SECRET_KEY=... bun run scripts/revenuecat-backfill-stripe.ts
 *
 * Reads users with tier=crew_member and stripeCustomerId, lists Stripe subscriptions,
 * and calls RevenueCat POST /v1/receipts for each active sub.
 */
import Stripe from "stripe";
import { syncStripePurchase } from "../app/lib/revenuecat.server";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const rcKey = process.env.REVENUECAT_STRIPE_PUBLIC_API_KEY;

if (!stripeKey || !rcKey) {
	console.error(
		"Set STRIPE_SECRET_KEY and REVENUECAT_STRIPE_PUBLIC_API_KEY to run backfill.",
	);
	process.exit(1);
}

const stripe = new Stripe(stripeKey, {
	apiVersion: "2026-02-25.clover",
	typescript: true,
});

const env = {
	REVENUECAT_STRIPE_PUBLIC_API_KEY: rcKey,
} as Env;

type BackfillRow = {
	userId: string;
	subscriptionId: string;
};

async function listActiveSubscriptionRows(): Promise<BackfillRow[]> {
	const rows: BackfillRow[] = [];
	let startingAfter: string | undefined;

	for (;;) {
		const page = await stripe.subscriptions.list({
			status: "active",
			limit: 100,
			starting_after: startingAfter,
		});

		for (const sub of page.data) {
			const userId =
				typeof sub.metadata?.userId === "string"
					? sub.metadata.userId
					: typeof sub.metadata?.app_user_id === "string"
						? sub.metadata.app_user_id
						: null;
			if (userId) {
				rows.push({ userId, subscriptionId: sub.id });
			}
		}

		if (!page.has_more) break;
		startingAfter = page.data.at(-1)?.id;
	}

	return rows;
}

async function main() {
	const rows = await listActiveSubscriptionRows();
	console.log(
		`Found ${rows.length} active Stripe subscriptions with user metadata.`,
	);

	let ok = 0;
	let fail = 0;

	for (const row of rows) {
		const success = await syncStripePurchase(
			env,
			row.userId,
			row.subscriptionId,
		);
		if (success) {
			ok += 1;
			console.log(`Synced ${row.subscriptionId} -> ${row.userId}`);
		} else {
			fail += 1;
			console.warn(`Failed ${row.subscriptionId} -> ${row.userId}`);
		}
	}

	console.log(`Done. success=${ok} failed=${fail}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
