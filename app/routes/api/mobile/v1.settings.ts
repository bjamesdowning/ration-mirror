import { data } from "react-router";
import {
	getUserSettings,
	patchUserSettings,
	writeUserSettings,
} from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
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
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const body = await request.json();
		const patch = MobileSettingsPatchSchema.parse(body);

		if (patch.restartOnboarding) {
			const db = context.cloudflare.env.DB;
			const current = await getUserSettings(db, userId);
			await writeUserSettings(db, userId, {
				...current,
				onboardingCompletedAt: undefined,
				onboardingStep: 0,
			});
			const settings = await getUserSettings(db, userId);
			return { settings };
		}

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
