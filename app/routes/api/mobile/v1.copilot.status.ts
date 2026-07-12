import { getGroupTierLimits } from "~/lib/capacity.server";
import { getCopilotStatus } from "~/lib/copilot/gate.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import type { Route } from "./+types/v1.copilot.status";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;
		const tierInfo = await getGroupTierLimits(env, organizationId);
		return getCopilotStatus(
			env,
			{
				userId,
				organizationId,
				tier: tierInfo.tier,
			},
			{ request },
		);
	} catch (e) {
		return handleApiError(e);
	}
}
