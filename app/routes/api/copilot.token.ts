import { requireActiveGroup } from "~/lib/auth.server";
import { getGroupTierLimits } from "~/lib/capacity.server";
import { createCopilotWebSessionToken } from "~/lib/copilot/web-session-token.server";
import { handleApiError } from "~/lib/error-handler";
import type { Route } from "./+types/copilot.token";

export async function action({ request, context }: Route.ActionArgs) {
	try {
		if (request.method !== "POST") {
			return Response.json({ error: "method_not_allowed" }, { status: 405 });
		}
		const { session, groupId } = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;
		const tierInfo = await getGroupTierLimits(env, groupId);
		return createCopilotWebSessionToken(env, {
			userId: session.user.id,
			organizationId: groupId,
			tier: tierInfo.tier,
		});
	} catch (e) {
		return handleApiError(e);
	}
}
