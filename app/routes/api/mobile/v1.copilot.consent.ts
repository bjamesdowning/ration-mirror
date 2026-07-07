import { z } from "zod";
import { getGroupTierLimits } from "~/lib/capacity.server";
import {
	getCopilotStatus,
	setCopilotAutoDeductConsent,
} from "~/lib/copilot/gate.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import type { Route } from "./+types/v1.copilot.consent";

const MobileCopilotConsentSchema = z.object({
	autoDeductConsent: z.boolean(),
});

export async function action({ request, context }: Route.ActionArgs) {
	try {
		if (request.method !== "POST") {
			return Response.json({ error: "method_not_allowed" }, { status: 405 });
		}
		const body = MobileCopilotConsentSchema.parse(await request.json());
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;
		await setCopilotAutoDeductConsent(
			env,
			{ userId, organizationId },
			body.autoDeductConsent,
		);
		const tierInfo = await getGroupTierLimits(env, organizationId);
		return getCopilotStatus(env, {
			userId,
			organizationId,
			tier: tierInfo.tier,
		});
	} catch (e) {
		return handleApiError(e);
	}
}
