import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	getOrganizationMetadata,
	patchOrganizationSupplySettings,
	resolveSupplyContext,
} from "~/lib/org-supply-settings.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { OrganizationSupplySettingsPatchSchema } from "~/lib/schemas/org-supply-settings";
import type { Route } from "./+types/organization.supply-settings";

/** GET /api/organization/supply-settings — read org supply planning horizon. */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	try {
		const metadata = await getOrganizationMetadata(
			context.cloudflare.env.DB,
			groupId,
		);
		const context_ = resolveSupplyContext(metadata);
		return {
			supplySettings: context_.supplySettings,
			window: context_.window,
		};
	} catch (e) {
		return handleApiError(e);
	}
}

/** PATCH /api/organization/supply-settings — update org supply planning horizon (owner/admin). */
export async function action({ request, context }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);

	if (request.method !== "PATCH") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"settings_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many requests. Please try again later.",
		);
	}

	try {
		const body = await request.json();
		const patch = OrganizationSupplySettingsPatchSchema.parse(body);
		const result = await patchOrganizationSupplySettings(
			context.cloudflare.env.DB,
			groupId,
			user.id,
			patch,
		);
		return result;
	} catch (e) {
		return handleApiError(e);
	}
}
