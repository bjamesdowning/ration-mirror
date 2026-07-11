import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import {
	getOrganizationMetadata,
	patchOrganizationSupplySettings,
	resolveSupplyContext,
} from "~/lib/org-supply-settings.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { OrganizationSupplySettingsPatchSchema } from "~/lib/schemas/org-supply-settings";
import type { Route } from "./+types/v1.organization.supply-settings";

/** GET /api/mobile/v1/organization/supply-settings */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { organizationId } = await requireMobileActiveGroup(context, request);
		const metadata = await getOrganizationMetadata(
			context.cloudflare.env.DB,
			organizationId,
		);
		const supplyContext = resolveSupplyContext(metadata);
		return {
			supplySettings: supplyContext.supplySettings,
			window: supplyContext.window,
		};
	} catch (e) {
		return handleApiError(e);
	}
}

/** PATCH /api/mobile/v1/organization/supply-settings */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "PATCH") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"settings_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const body = await request.json();
		const patch = OrganizationSupplySettingsPatchSchema.parse(body);
		const result = await patchOrganizationSupplySettings(
			context.cloudflare.env.DB,
			organizationId,
			userId,
			patch,
		);
		return result;
	} catch (e) {
		return handleApiError(e);
	}
}
