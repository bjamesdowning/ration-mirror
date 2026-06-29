import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { getMobileHubData } from "~/lib/mobile/hub.server";
import type { Route } from "./+types/v1.hub";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		return await getMobileHubData(
			context.cloudflare.env,
			organizationId,
			userId,
		);
	} catch (e) {
		return handleApiError(e);
	}
}
