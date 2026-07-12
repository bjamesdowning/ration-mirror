import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { patchOrganizationProfile } from "~/lib/org-profile.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { OrganizationProfilePatchSchema } from "~/lib/schemas/org-profile";
import type { Route } from "./+types/v1.organization.profile";

/** PATCH /api/mobile/v1/organization/profile */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "PATCH") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"settings_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const body = await request.json();
		const patch = OrganizationProfilePatchSchema.parse(body);
		return await patchOrganizationProfile(
			context.cloudflare.env.DB,
			organizationId,
			userId,
			patch,
		);
	} catch (e) {
		return handleApiError(e);
	}
}

/** GET is not supported. */
export async function loader() {
	throw data({ error: "Method not allowed" }, { status: 405 });
}
