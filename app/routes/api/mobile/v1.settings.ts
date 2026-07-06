import { data } from "react-router";
import { getUserSettings, patchUserSettings } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	MobileSettingsPatchSchema,
	normalizeMobileSettingsPatch,
} from "~/lib/schemas/mobile/auth";
import type { Route } from "./+types/v1.settings";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId } = await requireMobileActiveGroup(context, request);
		const settings = await getUserSettings(context.cloudflare.env.DB, userId);
		return { settings };
	} catch (e) {
		return handleApiError(e);
	}
}

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "PATCH") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId } = await requireMobileActiveGroup(context, request);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"settings_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const body = await request.json();
		const patch = MobileSettingsPatchSchema.parse(body);

		const settingsPatch = {
			...normalizeMobileSettingsPatch(patch),
			...(patch.hubProfile && patch.hubProfile !== "custom"
				? { hubLayout: undefined }
				: {}),
		};

		await patchUserSettings(context.cloudflare.env.DB, userId, settingsPatch);
		const settings = await getUserSettings(context.cloudflare.env.DB, userId);
		return { settings };
	} catch (e) {
		return handleApiError(e);
	}
}
