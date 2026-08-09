import { data } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	eraseNutritionData,
	getNutritionConsentStatus,
	grantNutritionConsent,
	withdrawNutritionConsent,
} from "~/lib/nutrition/consent.server";
import { NUTRITION_CONSENT_PURPOSES } from "~/lib/nutrition/consent-policy";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { NutritionPrivacyActionSchema } from "~/lib/schemas/nutrition-consent";
import type { Route } from "./+types/privacy.nutrition";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function requestMetadata(request: Request) {
	const locale =
		request.headers
			.get("Accept-Language")
			?.split(",")[0]
			?.trim()
			.slice(0, 35) || null;
	const clientVersion =
		request.headers.get("X-Ration-Client-Version")?.slice(0, 50) ?? null;
	return { locale, clientVersion };
}

async function consentStatuses(db: D1Database, userId: string) {
	return Promise.all(
		NUTRITION_CONSENT_PURPOSES.map((purpose) =>
			getNutritionConsentStatus(db, userId, purpose),
		),
	);
}

/** User-global nutrition privacy state. It remains available with flags off. */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { user } = await requireAuth(context, request);
		return data(
			{ consents: await consentStatuses(context.cloudflare.env.DB, user.id) },
			{ headers: PRIVATE_HEADERS },
		);
	} catch (error) {
		return handleApiError(error);
	}
}

/** Grant, withdraw, or erase private nutrition data. */
export async function action({ request, context }: Route.ActionArgs) {
	try {
		const { user } = await requireAuth(context, request);
		if (request.method !== "POST") {
			throw data({ error: "Method not allowed" }, { status: 405 });
		}

		const rateLimit = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"settings_mutation",
			user.id,
		);
		if (!rateLimit.allowed) {
			throw rateLimitResponse(
				rateLimit,
				"Too many privacy requests. Please try again later.",
			);
		}

		const parsed = NutritionPrivacyActionSchema.parse(await request.json());
		const db = context.cloudflare.env.DB;
		if (parsed.action === "grant") {
			const metadata = requestMetadata(request);
			await grantNutritionConsent(db, {
				userId: user.id,
				purpose: parsed.purpose,
				source: "web",
				policyVersion: parsed.policyVersion,
				statementVersion: parsed.statementVersion,
				statementSha256: parsed.statementSha256,
				affirmed: parsed.affirmed,
				requestId: parsed.requestId,
				clientSurface: "web_privacy_settings",
				...metadata,
			});
		} else if (parsed.action === "withdraw") {
			await withdrawNutritionConsent(db, {
				userId: user.id,
				purpose: parsed.purpose,
				requestId: parsed.requestId,
			});
		} else {
			await eraseNutritionData(db, {
				userId: user.id,
				dataset: parsed.dataset,
				requestId: parsed.requestId,
			});
		}

		return data(
			{ ok: true, consents: await consentStatuses(db, user.id) },
			{ headers: PRIVATE_HEADERS },
		);
	} catch (error) {
		return handleApiError(error);
	}
}
