import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { SharedItemUpdateSchema } from "~/lib/schemas/supply";
import { updateSharedItemPurchased } from "~/lib/supply.server";
import type { Route } from "./+types/shared.$token.items.$itemId";

/**
 * PATCH /api/shared/:token/items/:itemId - Toggle purchased status for shared list
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const clientIp =
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
		"unknown";

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"shared_toggle",
		clientIp,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests" },
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	const token = params.token;
	const itemId = params.itemId;

	if (!token || !itemId) {
		throw data({ error: "Token and Item ID required" }, { status: 400 });
	}

	try {
		if (request.method !== "PATCH") {
			throw data({ error: "Method not allowed" }, { status: 405 });
		}

		const json = await request.json();
		const input = SharedItemUpdateSchema.parse(json);

		const result = await updateSharedItemPurchased(
			context.cloudflare.env.DB,
			token,
			itemId,
			input.isPurchased,
			{ quantity: input.quantity, unit: input.unit },
		);

		return result;
	} catch (e) {
		return handleApiError(e);
	}
}
