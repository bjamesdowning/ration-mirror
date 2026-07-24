import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { leaveGroup } from "~/lib/group-membership.server";
import {
	listMobileOrganizations,
	requireMobileActiveGroup,
} from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.groups.leave";

/**
 * POST /api/mobile/v1/groups/leave - Non-owner leaves the active group.
 * Returns remaining organizations so the client can switch.
 */
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

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"group_membership_exit",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		await leaveGroup({
			env,
			organizationId,
			userId,
		});

		const organizations = await listMobileOrganizations(env, userId, null);

		return { success: true, organizations };
	} catch (error) {
		return handleApiError(error);
	}
}
