import { data } from "react-router";
import { getUserSettings, requireActiveGroup } from "~/lib/auth.server";
import { CapacityExceededError } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { completeSupplyList } from "~/lib/supply.server";
import { resolveUnitDisplayMode } from "~/lib/unit-display-mode";
import type { Route } from "./+types/supply-lists.$id.complete";

/**
 * POST /api/supply-lists/:id/complete
 * Docks all purchased items from the list into inventory, reconciles supply
 * selections, then removes purchased rows from the list.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const listId = params.id;
	log.info("[DOCK] Request for list", {
		listId: redactId(listId),
		groupId: redactId(groupId),
	});

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"grocery_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many requests. Please try again later.",
		);
	}

	if (!listId) {
		throw data({ error: "List ID required" }, { status: 400 });
	}

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const userSettings = await getUserSettings(
			context.cloudflare.env.DB,
			user.id,
		);
		const unitDisplayMode = resolveUnitDisplayMode(userSettings);

		const result = await completeSupplyList(
			context.cloudflare.env,
			groupId,
			listId,
			{ unitMode: unitDisplayMode, userId: user.id },
		);

		return {
			docked: result.docked,
			summary: "summary" in result ? result.summary : undefined,
			cargoSelectionsCleared:
				"cargoSelectionsCleared" in result
					? result.cargoSelectionsCleared
					: undefined,
			cargoSelectionsReduced:
				"cargoSelectionsReduced" in result
					? result.cargoSelectionsReduced
					: undefined,
			message: "message" in result ? result.message : undefined,
		};
	} catch (e) {
		if (e instanceof CapacityExceededError) {
			throw data(
				{
					error: "capacity_exceeded",
					resource: e.resource,
					current: e.current,
					limit: e.limit,
					tier: e.tier,
					isExpired: e.isExpired,
					canAdd: e.canAdd,
					upgradePath: "crew_member",
				},
				{ status: 403 },
			);
		}
		log.error("[DOCK] Error", e);
		return handleApiError(e);
	}
}
