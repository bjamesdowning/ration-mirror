import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileAIConsent } from "~/lib/mobile/ai-consent.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { mapScanSubmitError, submitVisualScan } from "~/lib/scan-submit.server";
import type { Route } from "./+types/v1.scan";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		await requireMobileAIConsent(context.cloudflare.env, userId);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"scan",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many scan requests. Please try again later.",
			);
		}

		const formData = await request.formData();
		const imageFile = formData.get("image");
		if (!imageFile || !(imageFile instanceof File)) {
			throw data({ error: "No file provided" }, { status: 400 });
		}

		return await submitVisualScan(context.cloudflare.env, {
			imageFile,
			userId,
			organizationId,
		});
	} catch (e) {
		mapScanSubmitError(e);
		return handleApiError(e);
	}
}
