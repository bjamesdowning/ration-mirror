import { data } from "react-router";
import { requireApiKey } from "~/lib/api-key.server";
import { applyCargoImport } from "~/lib/cargo.server";
import { parseInventoryCsv } from "~/lib/csv-parser";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.inventory.import";

/**
 * POST /api/v1/inventory/import - Import cargo from CSV body (API key auth).
 */
export async function action({ request, context }: Route.ActionArgs) {
	const { organizationId, apiKeyId } = await requireApiKey(
		context,
		request,
		"inventory",
	);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"api_import",
		apiKeyId,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many requests",
				retryAfter: rateLimitResult.retryAfter,
			},
			{
				status: 429,
				headers: {
					"Retry-After": String(rateLimitResult.retryAfter ?? 60),
				},
			},
		);
	}

	const contentType = request.headers.get("Content-Type") ?? "";
	if (
		!contentType.includes("text/csv") &&
		!contentType.includes("text/plain") &&
		!contentType.includes("application/octet-stream")
	) {
		throw data(
			{ error: "Content-Type must be text/csv or text/plain" },
			{ status: 400 },
		);
	}

	try {
		const text = await request.text();
		if (!text.trim()) {
			throw data({ error: "Empty CSV body" }, { status: 400 });
		}

		const { items, warnings } = parseInventoryCsv(text);
		if (items.length === 0) {
			throw data({ error: "No valid rows in CSV", warnings }, { status: 400 });
		}

		const result = await applyCargoImport(
			context.cloudflare.env,
			organizationId,
			items,
		);

		return {
			success: true,
			imported: result.imported,
			updated: result.updated,
			errors: result.errors.length > 0 ? result.errors : undefined,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
