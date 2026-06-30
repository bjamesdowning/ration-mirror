import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { getActiveSnoozes } from "~/lib/supply.server";
import type { Route } from "./+types/v1.supply.snoozes";

/** GET /api/mobile/v1/supply/snoozes — active snoozes for the org supply list. */
export async function loader({ context, request }: Route.LoaderArgs) {
	try {
		const { organizationId } = await requireMobileActiveGroup(context, request);
		const snoozes = await getActiveSnoozes(
			context.cloudflare.env.DB,
			organizationId,
		);
		return { snoozes };
	} catch (e) {
		return handleApiError(e);
	}
}

export async function action(_args: Route.ActionArgs) {
	throw data({ error: "Method not allowed" }, { status: 405 });
}
