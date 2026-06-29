import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { completeSupplyList } from "~/lib/supply.server";
import type { Route } from "./+types/v1.supply.complete";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"grocery_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const body = (await request.json()) as { listId?: string };
		const listId = body.listId;
		if (!listId) {
			throw data({ error: "listId is required" }, { status: 400 });
		}

		const result = await completeSupplyList(
			context.cloudflare.env,
			organizationId,
			listId,
		);
		return { success: true, docked: result.docked };
	} catch (e) {
		return handleApiError(e);
	}
}
