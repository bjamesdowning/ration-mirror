import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileUserAuth } from "~/lib/mobile/auth.server";
import {
	assertMobileOrgMembership,
	issueMobileTokenPair,
	revokeMobileRefreshFamilies,
} from "~/lib/mobile/token.server";
import { MobileActivateOrgSchema } from "~/lib/schemas/mobile/auth";
import type { Route } from "./+types/v1.orgs.$id.activate";

export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const orgId = params.id;
	if (!orgId) {
		throw data({ error: "Organization id required" }, { status: 400 });
	}

	try {
		const { userId } = await requireMobileUserAuth(context, request);
		MobileActivateOrgSchema.parse({ organizationId: orgId });
		await assertMobileOrgMembership(context.cloudflare.env, userId, orgId);
		await revokeMobileRefreshFamilies(context.cloudflare.env, userId);
		const tokens = await issueMobileTokenPair(
			context.cloudflare.env,
			userId,
			orgId,
		);
		return tokens;
	} catch (e) {
		if (e instanceof Error && e.message === "forbidden_org") {
			throw data(
				{ error: "Forbidden", code: "forbidden_org" },
				{ status: 403 },
			);
		}
		return handleApiError(e);
	}
}
