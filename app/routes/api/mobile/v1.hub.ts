import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { getMobileHubData } from "~/lib/mobile/hub.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.hub";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"hub_read",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many hub requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		return await getMobileHubData(
			context.cloudflare.env,
			organizationId,
			userId,
		);
	} catch (e) {
		return handleApiError(e);
	}
}
