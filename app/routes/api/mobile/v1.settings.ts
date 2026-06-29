import { data } from "react-router";
import { getUserSettings, patchUserSettings } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { MobileSettingsPatchSchema } from "~/lib/schemas/mobile/auth";
import type { Route } from "./+types/v1.settings";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "PATCH") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId } = await requireMobileActiveGroup(context, request);
		const body = await request.json();
		const patch = MobileSettingsPatchSchema.parse(body);
		await patchUserSettings(context.cloudflare.env.DB, userId, patch);
		const settings = await getUserSettings(context.cloudflare.env.DB, userId);
		return { settings };
	} catch (e) {
		return handleApiError(e);
	}
}
