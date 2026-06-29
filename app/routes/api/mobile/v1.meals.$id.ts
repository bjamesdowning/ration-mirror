import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { getMeal } from "~/lib/meals.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import type { Route } from "./+types/v1.meals.$id";

export async function loader({ request, context, params }: Route.LoaderArgs) {
	try {
		const { organizationId } = await requireMobileActiveGroup(context, request);
		const id = params.id;
		if (!id) throw data({ error: "Not Found" }, { status: 404 });

		const meal = await getMeal(context.cloudflare.env.DB, organizationId, id);
		if (!meal) throw data({ error: "Not Found" }, { status: 404 });
		return { meal };
	} catch (e) {
		return handleApiError(e);
	}
}
