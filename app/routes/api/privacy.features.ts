import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	disableFeature,
	enableFeature,
	eraseFeatureNutritionData,
	getFeatureEnablementStatus,
	setFeatureEnablement,
} from "~/lib/feature-enablement.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { FeatureEnablementActionSchema } from "~/lib/schemas/feature-enablement";
import type { Route } from "./+types/privacy.features";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

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
		const {
			session: { user },
			groupId,
		} = await requireActiveGroup(context, request);
		const status = await getFeatureEnablementStatus(context.cloudflare.env, {
			userId: user.id,
			organizationId: groupId,
		});
		return data(status, { headers: PRIVATE_HEADERS });
	} catch (error) {
		return handleApiError(error);
	}
}

export async function action({ request, context }: Route.ActionArgs) {
	try {
		if (request.method !== "POST") {
			throw data({ error: "Method not allowed" }, { status: 405 });
		}

		const {
			session: { user },
			groupId,
		} = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;

		const rateLimit = await checkRateLimit(
			env.RATION_KV,
			"settings_mutation",
			user.id,
		);
		if (!rateLimit.allowed) {
			throw rateLimitResponse(
				rateLimit,
				"Too many privacy requests. Please try again later.",
			);
		}

		const parsed = FeatureEnablementActionSchema.parse(await request.json());
		const identity = { userId: user.id, organizationId: groupId };
		const meta = {
			source: "web" as const,
			clientSurface: "web_feature_enablement",
			...requestMetadata(request),
		};

		let status: Awaited<ReturnType<typeof getFeatureEnablementStatus>>;
		if (parsed.action === "set") {
			status = await setFeatureEnablement(
				env,
				identity,
				{
					aiFeatures: parsed.aiFeatures,
					macroTracking: parsed.macroTracking,
					affirmed: parsed.affirmed,
				},
				meta,
			);
		} else if (parsed.action === "enable") {
			status = await enableFeature(env, identity, parsed.feature, meta);
		} else if (parsed.action === "disable") {
			status = await disableFeature(env, identity, parsed.feature);
		} else {
			status = await eraseFeatureNutritionData(
				env,
				identity,
				parsed.dataset,
				parsed.requestId,
			);
		}

		return data({ ok: true, ...status }, { headers: PRIVATE_HEADERS });
	} catch (error) {
		return handleApiError(error);
	}
}
