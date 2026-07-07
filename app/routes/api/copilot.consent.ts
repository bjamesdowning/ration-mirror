import { z } from "zod";
import { requireActiveGroup } from "~/lib/auth.server";
import { getGroupTierLimits } from "~/lib/capacity.server";
import {
	getCopilotStatus,
	setCopilotAutoDeductConsent,
} from "~/lib/copilot/gate.server";
import { handleApiError } from "~/lib/error-handler";
import type { Route } from "./+types/copilot.consent";

const CopilotConsentSchema = z.object({
	autoDeductConsent: z.boolean(),
});

export async function action({ request, context }: Route.ActionArgs) {
	try {
		if (request.method !== "POST") {
			return Response.json({ error: "method_not_allowed" }, { status: 405 });
		}
		const body = CopilotConsentSchema.parse(await request.json());
		const { session, groupId } = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;
		await setCopilotAutoDeductConsent(
			env,
			{ userId: session.user.id, organizationId: groupId },
			body.autoDeductConsent,
		);
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
