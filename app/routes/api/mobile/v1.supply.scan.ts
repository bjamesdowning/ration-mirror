import { data } from "react-router";
import { getUserSettings } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildFlagContext } from "~/lib/feature-flags/flags.server";
import { log } from "~/lib/logging.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import {
	SUPPLY_SCAN_COMPLETE_INVALID_MESSAGE,
	SupplyScanCompleteRequestSchema,
	SupplyScanMatchQuerySchema,
} from "~/lib/schemas/supply-scan";
import {
	completeSupplyScan,
	getSupplyScanMatch,
	SupplyScanError,
	validateSupplyOnlyIds,
} from "~/lib/supply-scan.server";
import { resolveUnitDisplayMode } from "~/lib/unit-display-mode";
import type { Route } from "./+types/v1.supply.scan";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { userId, organizationId } = await requireMobileActiveGroup(
		context,
		request,
	);
	const env = context.cloudflare.env;

	await assertFeatureEnabled(
		env,
		"ai-dock-from-receipt",
		buildFlagContext(request, env, { user: { id: userId } }),
	);

	const rateLimitResult = await checkRateLimit(
		env.RATION_KV,
		"status_poll",
		userId,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many requests. Please try again later.",
		);
	}

	const url = new URL(request.url);
	const listId = url.searchParams.get("listId");
	if (!listId) {
		throw data({ error: "listId is required" }, { status: 400 });
	}

	const parsed = SupplyScanMatchQuerySchema.safeParse({
		requestId: url.searchParams.get("requestId"),
	});
	if (!parsed.success) {
		throw data({ error: "Invalid requestId" }, { status: 400 });
	}

	try {
		return await getSupplyScanMatch(
			env,
			organizationId,
			listId,
			parsed.data.requestId,
		);
	} catch (e) {
		if (e instanceof SupplyScanError) {
			const status =
				e.code === "job_not_found" || e.code === "list_not_found" ? 404 : 400;
			throw data({ error: e.message, code: e.code }, { status });
		}
		return handleApiError(e);
	}
}

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;

		await assertFeatureEnabled(
			env,
			"ai-dock-from-receipt",
			buildFlagContext(request, env, { user: { id: userId } }),
		);

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"inventory_batch",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const json = await request.json();
		const body = json as { listId?: string } & Record<string, unknown>;
		const listId = body.listId;
		if (!listId || typeof listId !== "string") {
			throw data({ error: "listId is required" }, { status: 400 });
		}

		const parsed = SupplyScanCompleteRequestSchema.safeParse(body);
		if (!parsed.success) {
			log.warn("Supply scan complete validation failed", {
				issues: parsed.error.issues.slice(0, 8).map((i) => ({
					path: i.path.join("."),
					code: i.code,
				})),
			});
			throw data(
				{ error: SUPPLY_SCAN_COMPLETE_INVALID_MESSAGE },
				{ status: 400 },
			);
		}

		await validateSupplyOnlyIds(env, listId, parsed.data.supplyOnlyIds);

		const userSettings = await getUserSettings(env.DB, userId);
		const unitDisplayMode = resolveUnitDisplayMode(userSettings);

		return await completeSupplyScan(env, organizationId, listId, parsed.data, {
			unitMode: unitDisplayMode,
			userId,
		});
	} catch (e) {
		if (e instanceof SupplyScanError) {
			const status =
				e.code === "list_not_found" || e.code === "job_not_found" ? 404 : 400;
			throw data({ error: e.message, code: e.code }, { status });
		}
		return handleApiError(e);
	}
}
