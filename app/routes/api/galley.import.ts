import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { applyGalleyImport } from "~/lib/galley.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { GalleyManifestSchema } from "~/lib/schemas/galley-manifest";
import type { Route } from "./+types/galley.import";

const MAX_BODY_BYTES = 1_000_000; // 1 MB

/**
 * POST /api/galley/import - Import galley from JSON body (session auth).
 */
export async function action({ request, context }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"meal_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{
				status: 429,
				headers: {
					"Retry-After": String(rateLimitResult.retryAfter ?? 60),
				},
			},
		);
	}

	if (request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405 });
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
			groupId,
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
