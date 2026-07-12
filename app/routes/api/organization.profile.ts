import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { patchOrganizationProfile } from "~/lib/org-profile.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { OrganizationProfilePatchSchema } from "~/lib/schemas/org-profile";
import type { Route } from "./+types/organization.profile";

/** PATCH /api/organization/profile — update active group display name (owner/admin). */
export async function action({ request, context }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);

	if (request.method !== "PATCH") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"settings_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many requests. Please try again later.",
		);
	}

	try {
		const body = await request.json();
		const patch = OrganizationProfilePatchSchema.parse(body);
		return await patchOrganizationProfile(
			context.cloudflare.env.DB,
			groupId,
			user.id,
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
