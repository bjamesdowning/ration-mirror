import { redirect } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import type { Route } from "./+types/checkout.return";

// Fulfillment is handled by the parent dashboard layout loader (which runs
// first and needs the updated tier for capacity checks). This route only
// redirects to settings with the transaction status.
export async function loader(args: Route.LoaderArgs) {
	await requireActiveGroup(args.context, args.request);
	return redirect("/dashboard/settings?transaction=success");
}

export default function CheckoutReturn() {
	return null;
}
