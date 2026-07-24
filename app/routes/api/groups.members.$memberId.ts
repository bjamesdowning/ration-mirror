import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { removeGroupMember } from "~/lib/group-membership.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/groups.members.$memberId";

/**
 * DELETE /api/groups/members/:memberId - Owner removes a non-owner member.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "DELETE") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const { session, groupId } = await requireActiveGroup(context, request);
	const actorId = session.user.id;
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

	try {
		const result = await removeGroupMember({
			env: context.cloudflare.env,
			organizationId: groupId,
			actorUserId: actorId,
			targetMemberId,
		});
		return { success: true, memberId: result.memberId };
	} catch (e) {
		return handleApiError(e);
	}
}
