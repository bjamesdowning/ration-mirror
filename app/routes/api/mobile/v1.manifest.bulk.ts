import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { ensureMealPlan } from "~/lib/manifest.server";
import { submitManifestBulkEntries } from "~/lib/manifest-bulk-submit.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MobileBulkEntryCreateSchema } from "~/lib/schemas/mobile/manifest";
import type { Route } from "./+types/v1.manifest.bulk";

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

		const body = await request.json();
		const input = MobileBulkEntryCreateSchema.parse(body);
		const plan = await ensureMealPlan(
			context.cloudflare.env.DB,
			organizationId,
		);

		return await submitManifestBulkEntries(
			context.cloudflare.env.DB,
			organizationId,
			plan.id,
			input,
		);
	} catch (e) {
		return handleApiError(e);
	}
}
