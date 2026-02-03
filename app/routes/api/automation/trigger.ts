import { data, redirect } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { createGroceryListFromAllMeals } from "~/lib/grocery.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/trigger";

export async function action({ request, context }: Route.ActionArgs) {
	const { groupId, session } = await requireActiveGroup(context, request);

	// Rate limiting to prevent automation spam
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"automation",
		session.user.id,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many automation requests. Please try again later.",
				retryAfter: rateLimitResult.retryAfter,
			},
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
				},
			},
		);
	}

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
		groupId,
		listName,
	);

	// Redirect back to referring page or dashboard
	const referer = request.headers.get("Referer") || "/dashboard";
	return redirect(referer);
}
