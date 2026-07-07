import { data } from "react-router";
import { getUserSettings } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { completeSupplyList } from "~/lib/supply.server";
import { resolveUnitDisplayMode } from "~/lib/unit-display-mode";
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

		const userSettings = await getUserSettings(
			context.cloudflare.env.DB,
			userId,
		);
		const unitDisplayMode = resolveUnitDisplayMode(userSettings);

		const result = await completeSupplyList(
			context.cloudflare.env,
			organizationId,
			listId,
			{ unitMode: unitDisplayMode },
		);
		return { success: true, docked: result.docked };
	} catch (e) {
		return handleApiError(e);
	}
}
