import { requireActiveGroup } from "~/lib/auth.server";
import { getGroupTierLimits } from "~/lib/capacity.server";
import { getCopilotStatus } from "~/lib/copilot/gate.server";
import { handleApiError } from "~/lib/error-handler";
import type { Route } from "./+types/copilot.status";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { session, groupId } = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;
		const tierInfo = await getGroupTierLimits(env, groupId);
		return getCopilotStatus(env, {
			userId: session.user.id,
			organizationId: groupId,
			tier: tierInfo.tier,
		});
	} catch (e) {
		return handleApiError(e);
	}
}
