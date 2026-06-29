import { handleApiError } from "~/lib/error-handler";
import {
	listMobileOrganizations,
	requireMobileAuth,
} from "~/lib/mobile/auth.server";
import type { Route } from "./+types/v1.orgs";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileAuth(
			context,
			request,
		);
		const organizations = await listMobileOrganizations(
			context.cloudflare.env,
			userId,
			organizationId,
		);
		return { organizations };
	} catch (e) {
		return handleApiError(e);
	}
}
