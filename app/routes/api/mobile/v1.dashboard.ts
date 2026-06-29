import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { getMobileDashboard } from "~/lib/mobile/dashboard.server";
import type { Route } from "./+types/v1.dashboard";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { organizationId } = await requireMobileActiveGroup(context, request);
		return getMobileDashboard(context.cloudflare.env, organizationId);
	} catch (e) {
		return handleApiError(e);
	}
}
