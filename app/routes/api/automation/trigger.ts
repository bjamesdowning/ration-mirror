import { redirect } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { createGroceryListFromAllMeals } from "~/lib/grocery.server";
import type { Route } from "./+types/trigger";

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);

	const dateFormatter = new Intl.DateTimeFormat("en-US", {
		weekday: "short",
		day: "numeric",
		month: "short",
		hour: "numeric",
		minute: "numeric",
	});
	const dateStr = dateFormatter.format(new Date());
	const listName = `Manual: ${dateStr}`;

	await createGroceryListFromAllMeals(
		context.cloudflare.env.DB,
		user.id,
		listName,
	);

	// Redirect back to referring page or dashboard
	const referer = request.headers.get("Referer") || "/dashboard";
	return redirect(referer);
}
