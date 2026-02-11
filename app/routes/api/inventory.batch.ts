import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { log } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { BatchAddInventorySchema } from "~/lib/schemas/scan";
import type { Route } from "./+types/inventory.batch";

/**
 * Batch add multiple items to inventory from scan results
 */
export async function action({ request, context }: Route.ActionArgs) {
	const { groupId, session } = await requireActiveGroup(context, request);

	// Rate limiting to prevent DB overload
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"inventory_batch",
		session.user.id,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many batch requests. Please try again later.",
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

	try {
		const body = await request.json();
		const result = BatchAddInventorySchema.safeParse(body);

		if (!result.success) {
			throw data(
				{ error: "Invalid request", issues: result.error.flatten() },
				{ status: 400 },
			);
		}

		const { items } = result.data;
		const mergeItems = items.filter((item) => item.mergeTargetId);
		const newItems = items.filter((item) => !item.mergeTargetId);

		// Collect all insert operations for batching
		const batchOps = [];
		const now = new Date();

		if (mergeItems.length > 0) {
			const mergeIds = mergeItems
				.map((item) => item.mergeTargetId)
				.filter((id): id is string => Boolean(id));
			const placeholders = mergeIds.map(() => "?").join(", ");
			const existingResults = await context.cloudflare.env.DB.prepare(
				`SELECT id FROM inventory WHERE organization_id = ? AND id IN (${placeholders})`,
			)
				.bind(groupId, ...mergeIds)
				.all();
			const allowedIds = new Set(
				(existingResults.results ?? []).map((row) => row.id as string),
			);

			for (const item of mergeItems) {
				if (!item.mergeTargetId || !allowedIds.has(item.mergeTargetId)) {
					throw data({ error: "Invalid merge target" }, { status: 400 });
				}
			}

			for (const item of mergeItems) {
				batchOps.push(
					context.cloudflare.env.DB.prepare(
						`UPDATE inventory
						 SET quantity = quantity + ?, updated_at = ?
						 WHERE id = ? AND organization_id = ?`,
					).bind(
						item.quantity,
						Math.floor(now.getTime() / 1000),
						item.mergeTargetId,
						groupId,
					),
				);
			}
		}

		for (const item of newItems) {
			batchOps.push(
				context.cloudflare.env.DB.prepare(
					`INSERT INTO inventory (id, organization_id, name, quantity, unit, domain, status, tags, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				).bind(
					crypto.randomUUID(),
					groupId,
					item.name,
					item.quantity,
					item.unit,
					item.domain,
					"stable",
					JSON.stringify(item.tags || []),
					Math.floor(now.getTime() / 1000),
					Math.floor(now.getTime() / 1000),
				),
			);
		}

		// Execute all inserts in a single batch
		const results = await context.cloudflare.env.DB.batch(batchOps);

		// Count successful inserts
		const addedCount = results.filter((r) => r.success).length;
		const errors = results
			.map((r, idx) =>
				!r.success ? { name: items[idx].name, error: r.error } : null,
			)
			.filter(Boolean);

		return {
			success: true,
			added: addedCount,
			total: items.length,
			errors: errors.length > 0 ? errors : undefined,
		};
	} catch (error) {
		log.error("Batch add failed", error);
		if (error instanceof Response) {
			throw error;
		}
		throw data({ error: "Failed to add items" }, { status: 500 });
	}
}
