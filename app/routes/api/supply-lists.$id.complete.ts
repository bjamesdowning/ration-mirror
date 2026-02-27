import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { supplyItem } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { CapacityExceededError } from "~/lib/capacity.server";
import { dockSupplyItems } from "~/lib/cargo.server";
import { handleApiError } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/supply-lists.$id.complete";

/**
 * POST /api/grocery-lists/:id/complete
 * Docks all purchased items from the list into inventory and removes them from the list.
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
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	if (!listId) {
		throw data({ error: "List ID required" }, { status: 400 });
	}

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const d1 = drizzle(context.cloudflare.env.DB);

		// 1. Get purchased items
		const purchasedItems = await d1
			.select()
			.from(supplyItem)
			.where(
				and(eq(supplyItem.listId, listId), eq(supplyItem.isPurchased, true)),
			);

		log.info("[DOCK] Found purchased items", {
			count: purchasedItems.length,
		});

		if (purchasedItems.length === 0) {
			return {
				docked: 0,
				created: 0,
				message: "No purchased items to dock",
			};
		}

		// 2. Dock them
		const results = await dockSupplyItems(
			context.cloudflare.env,
			groupId,
			purchasedItems,
		);

		// 3. Remove them from the list in a single batch — reduces N sequential
		//    D1 round-trips to one atomic call. The `purchasedItems.length > 0`
		//    guard ensures the array is non-empty; we cast via `unknown` because
		//    Drizzle's batch() tuple type cannot be inferred from a mapped array.
		if (purchasedItems.length > 0) {
			const deleteStatements = purchasedItems.map((item) =>
				d1.delete(supplyItem).where(eq(supplyItem.id, item.id)),
			);
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch requires a non-empty tuple which cannot be inferred from Array.map
			await d1.batch(deleteStatements as unknown as any);
		}

		return {
			docked: results.updated + results.created,
			summary: results,
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
