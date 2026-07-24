import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { removeGroupMember } from "~/lib/group-membership.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.groups.members.$memberId";

/**
 * DELETE /api/mobile/v1/groups/members/:memberId - Owner removes a non-owner member.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "DELETE") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId: actorId, organizationId: groupId } =
			await requireMobileActiveGroup(context, request);
		const targetMemberId = params.memberId;

		if (!targetMemberId) {
			throw data({ error: "Member ID required" }, { status: 400 });
		}

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"group_membership_exit",
			actorId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const result = await removeGroupMember({
			env: context.cloudflare.env,
			organizationId: groupId,
			actorUserId: actorId,
			targetMemberId,
		});

		return { success: true, memberId: result.memberId };
	} catch (error) {
		return handleApiError(error);
	}
}
