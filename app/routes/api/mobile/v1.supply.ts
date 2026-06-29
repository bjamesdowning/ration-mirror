import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { getSupplyList } from "~/lib/supply.server";
import type { Route } from "./+types/v1.supply";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { organizationId } = await requireMobileActiveGroup(context, request);
		const list = await getSupplyList(context.cloudflare.env.DB, organizationId);
		return { list };
	} catch (e) {
		return handleApiError(e);
	}
}
