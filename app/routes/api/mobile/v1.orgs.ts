import { handleApiError } from "~/lib/error-handler";
import {
	listMobileOrganizations,
	requireMobileUserAuth,
} from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.orgs";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId } = await requireMobileUserAuth(context, request);
		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"orgs_read",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many organization requests. Please try again later.",
			);
		}
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
