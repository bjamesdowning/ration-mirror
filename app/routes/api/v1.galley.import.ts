import { data } from "react-router";
import { API_SCOPES, requireApiKey } from "~/lib/api-key.server";
import { handleApiError } from "~/lib/error-handler";
import { applyGalleyImport } from "~/lib/galley.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { GalleyManifestSchema } from "~/lib/schemas/galley-manifest";
import type { Route } from "./+types/v1.galley.import";

const MAX_BODY_BYTES = 1_000_000; // 1 MB

/**
 * POST /api/v1/galley/import - Import galley from JSON body (API key auth).
 */
export async function action({ request, context }: Route.ActionArgs) {
	const { organizationId, apiKeyId } = await requireApiKey(
		context,
		request,
		API_SCOPES.galley,
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
		!contentType.includes("application/json") &&
		!contentType.includes("text/json")
	) {
		throw data(
			{ error: "Content-Type must be application/json" },
			{ status: 400 },
		);
	}

	try {
		const text = await request.text();
		if (!text.trim()) {
			throw data({ error: "Empty JSON body" }, { status: 400 });
		}

		if (text.length > MAX_BODY_BYTES) {
			throw data(
				{ error: "Manifest too large. Max size is 1 MB." },
				{ status: 400 },
			);
		}

		const parsed = JSON.parse(text) as unknown;
		const result = GalleyManifestSchema.safeParse(parsed);
		if (!result.success) {
			const first = result.error.issues[0];
			throw data(
				{
					error: first
						? `${first.path.join(".")}: ${first.message}`
						: "Invalid manifest",
				},
				{ status: 400 },
			);
		}

		const importResult = await applyGalleyImport(
			context.cloudflare.env.DB,
			organizationId,
			result.data,
			context.cloudflare.env,
		);

		return {
			success: true,
			imported: importResult.imported,
			updated: importResult.updated,
			errors: importResult.errors.length > 0 ? importResult.errors : undefined,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
