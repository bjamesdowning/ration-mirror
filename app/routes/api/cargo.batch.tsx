import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { applyCargoImport, getCargo } from "~/lib/cargo.server";
import type { ParsedCsvItem } from "~/lib/csv-parser";
import { log } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { BatchAddCargoSchema } from "~/lib/schemas/scan";
import type { Route } from "./+types/cargo.batch";

/**
 * Batch add multiple items to inventory from scan results.
 * Uses shared applyCargoImport: merge items update existing row quantity; new items create rows.
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
		const mergeItems = items.filter((item) => item.mergeTargetId);
		const newItems = items.filter((item) => !item.mergeTargetId);

		const parsed: ParsedCsvItem[] = [];

		if (mergeItems.length > 0) {
			const existingCargo = await getCargo(context.cloudflare.env.DB, groupId);
			const byId = new Map(existingCargo.map((c) => [c.id, c]));
			for (const item of mergeItems) {
				const targetId = item.mergeTargetId;
				if (!targetId) continue;
				const existing = byId.get(targetId);
				if (!existing) {
					parsed.push({
						name: item.name,
						quantity: item.quantity,
						unit: item.unit,
						domain: item.domain,
						tags: item.tags,
						expiresAt: item.expiresAt?.toISOString().slice(0, 10),
					});
					continue;
				}
				parsed.push({
					id: targetId,
					name: existing.name,
					quantity: existing.quantity + item.quantity,
					unit: existing.unit,
					domain: existing.domain,
					tags:
						typeof existing.tags === "string"
							? (JSON.parse(existing.tags || "[]") as string[])
							: (existing.tags as string[]),
					expiresAt: existing.expiresAt
						? new Date(existing.expiresAt).toISOString().slice(0, 10)
						: undefined,
				});
			}
		}

		for (const item of newItems) {
			parsed.push({
				name: item.name,
				quantity: item.quantity,
				unit: item.unit,
				domain: item.domain,
				tags: item.tags,
				expiresAt: item.expiresAt?.toISOString().slice(0, 10),
			});
		}

		const applyResult = await applyCargoImport(
			context.cloudflare.env,
			groupId,
			parsed,
		);

		const errors =
			applyResult.errors.length > 0 ? applyResult.errors : undefined;
		return {
			success: true,
			added: applyResult.imported,
			updated: applyResult.updated,
			total: items.length,
			errors,
		};
	} catch (error) {
		log.error("Batch add failed", error);
		if (error instanceof Response) {
			throw error;
		}
		throw data({ error: "Failed to add items" }, { status: 500 });
	}
}
