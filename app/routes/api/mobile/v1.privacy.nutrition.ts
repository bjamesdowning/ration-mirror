import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileUserAuth } from "~/lib/mobile/auth.server";
import {
	eraseNutritionData,
	getNutritionConsentStatus,
	grantNutritionConsent,
	withdrawNutritionConsent,
} from "~/lib/nutrition/consent.server";
import { NUTRITION_CONSENT_PURPOSES } from "~/lib/nutrition/consent-policy";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { NutritionPrivacyActionSchema } from "~/lib/schemas/nutrition-consent";
import type { Route } from "./+types/v1.privacy.nutrition";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

async function consentStatuses(db: D1Database, userId: string) {
	return Promise.all(
		NUTRITION_CONSENT_PURPOSES.map((purpose) =>
			getNutritionConsentStatus(db, userId, purpose),
		),
	);
}

function requestMetadata(request: Request) {
	return {
		clientVersion:
			request.headers.get("X-Ration-Client-Version")?.slice(0, 50) ?? null,
		locale:
			request.headers
				.get("Accept-Language")
				?.split(",")[0]
				?.trim()
				.slice(0, 35) || null,
	};
}

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId } = await requireMobileUserAuth(context, request);
		return data(
			{
				consents: await consentStatuses(context.cloudflare.env.DB, userId),
			},
			{ headers: PRIVATE_HEADERS },
		);
	} catch (error) {
		return handleApiError(error);
	}
}

export async function action({ request, context }: Route.ActionArgs) {
	try {
		const { userId } = await requireMobileUserAuth(context, request);
		if (request.method !== "POST") {
			throw data({ error: "Method not allowed" }, { status: 405 });
		}

		const rateLimit = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"settings_mutation",
			userId,
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
			await grantNutritionConsent(db, {
				userId,
				purpose: parsed.purpose,
				source: "mobile",
				policyVersion: parsed.policyVersion,
				statementVersion: parsed.statementVersion,
				statementSha256: parsed.statementSha256,
				affirmed: parsed.affirmed,
				requestId: parsed.requestId,
				clientSurface: "ios_privacy_settings",
				...requestMetadata(request),
			});
		} else if (parsed.action === "withdraw") {
			await withdrawNutritionConsent(db, {
				userId,
				purpose: parsed.purpose,
				requestId: parsed.requestId,
			});
		} else {
			await eraseNutritionData(db, {
				userId,
				dataset: parsed.dataset,
				requestId: parsed.requestId,
			});
		}

		return data(
			{ ok: true, consents: await consentStatuses(db, userId) },
			{ headers: PRIVATE_HEADERS },
		);
	} catch (error) {
		return handleApiError(error);
	}
}
