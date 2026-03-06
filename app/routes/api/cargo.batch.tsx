import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { checkCapacity } from "~/lib/capacity.server";
import { type IngestItem, ingestCargoItems } from "~/lib/cargo.server";
import { log } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { BatchAddCargoSchema } from "~/lib/schemas/scan";
import type { SupportedUnit } from "~/lib/units";
import type { Route } from "./+types/cargo.batch";

/**
 * Batch add multiple items to inventory from scan results.
 * Uses ingestCargoItems for centralized vector-assisted deduplication.
 */
export async function action({ request, context }: Route.ActionArgs) {
	const { groupId, session } = await requireActiveGroup(context, request);

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
		const result = BatchAddCargoSchema.safeParse(body);

		if (!result.success) {
			throw data(
				{ error: "Invalid request", issues: result.error.flatten() },
				{ status: 400 },
			);
		}

		const { items } = result.data;
		const ingestItems: IngestItem[] = items.map((it) => ({
			name: it.name,
			quantity: it.quantity,
			unit: it.unit as SupportedUnit,
			domain: it.domain,
			tags: it.tags,
			expiresAt: it.expiresAt,
			mergeTargetId: it.mergeTargetId,
		}));

		const ingestResults = await ingestCargoItems(
			context.cloudflare.env,
			groupId,
			ingestItems,
			{
				strictMergeTarget: false,
				waitUntil: context.cloudflare.ctx.waitUntil.bind(
					context.cloudflare.ctx,
				),
			},
		);

		let added = 0;
		let updated = 0;
		const errors: Array<{ name: string; error: string }> = [];
		const hasCapacityError = ingestResults.some(
			(r) => r.status === "capacity_exceeded",
		);
		for (let i = 0; i < ingestResults.length; i++) {
			const r = ingestResults[i];
			const it = items[i];
			if (r.status === "created") added += 1;
			else if (r.status === "merged") updated += 1;
			else if (r.status === "capacity_exceeded" || r.status === "error")
				errors.push({ name: it.name, error: r.error ?? r.status });
		}

		const response: {
			success: boolean;
			added: number;
			updated: number;
			total: number;
			errors?: Array<{ name: string; error: string }>;
			error?: "capacity_exceeded";
			canAdd?: number;
		} = {
			success: true,
			added,
			updated,
			total: items.length,
			errors: errors.length > 0 ? errors : undefined,
		};
		if (hasCapacityError) {
			response.error = "capacity_exceeded";
			const capacity = await checkCapacity(
				context.cloudflare.env,
				groupId,
				"cargo",
				0,
			);
			response.canAdd = capacity.canAdd;
		}
		return response;
	} catch (error) {
		log.error("Batch add failed", error);
		if (error instanceof Response) {
			throw error;
		}
		throw data({ error: "Failed to add items" }, { status: 500 });
	}
}
