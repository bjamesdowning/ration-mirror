import { data } from "react-router";
import { checkCapacity } from "~/lib/capacity.server";
import { type IngestItem, ingestCargoItems } from "~/lib/cargo.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { BatchAddCargoSchema } from "~/lib/schemas/scan";
import type { SupportedUnit } from "~/lib/units";
import type { Route } from "./+types/v1.cargo.batch";

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
			"inventory_batch",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many batch requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const body = await request.json();
		const { items } = BatchAddCargoSchema.parse(body);
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
			organizationId,
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
		for (let i = 0; i < ingestResults.length; i++) {
			const r = ingestResults[i];
			const name = items[i]?.name ?? "unknown";
			if (r.status === "created") added++;
			else if (r.status === "merged") updated++;
			else if (r.status === "capacity_exceeded") {
				const capacity = await checkCapacity(
					context.cloudflare.env,
					organizationId,
					"cargo",
					1,
				);
				errors.push({
					name,
					error: `capacity_exceeded:${capacity.limit}`,
				});
			} else if (r.status === "error") {
				errors.push({ name, error: r.error ?? "unknown error" });
			}
		}

		return { added, updated, errors };
	} catch (e) {
		return handleApiError(e);
	}
}
