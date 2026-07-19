import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildFlagContext } from "~/lib/feature-flags/flags.server";
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
		const env = context.cloudflare.env;

		await requireMobileAIConsent(env, userId);

		const rateLimitResult = await checkRateLimit(env.RATION_KV, "scan", userId);
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

		return await submitVisualScan(env, {
			imageFile,
			userId,
			organizationId,
			flagContext: buildFlagContext(request, env, { user: { id: userId } }),
		});
	} catch (e) {
		mapScanSubmitError(e);
		return handleApiError(e);
	}
}
