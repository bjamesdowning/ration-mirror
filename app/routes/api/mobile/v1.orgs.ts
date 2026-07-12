import { handleApiError } from "~/lib/error-handler";
import {
	listMobileOrganizations,
	requireMobileUserAuth,
} from "~/lib/mobile/auth.server";
import type { Route } from "./+types/v1.orgs";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId } = await requireMobileUserAuth(context, request);
		const organizations = await listMobileOrganizations(
			context.cloudflare.env,
			userId,
			null,
		);
		return { organizations };
	} catch (e) {
		return handleApiError(e);
	}
}
