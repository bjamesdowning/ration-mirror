import { data } from "react-router";
import { getUserSettings, requireActiveGroup } from "~/lib/auth.server";
import { CapacityExceededError } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildFlagContext } from "~/lib/feature-flags/flags.server";
import { log } from "~/lib/logging.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import {
	SUPPLY_SCAN_COMPLETE_INVALID_MESSAGE,
	SupplyScanCompleteRequestSchema,
} from "~/lib/schemas/supply-scan";
import {
	completeSupplyScan,
	SupplyScanError,
	validateSupplyOnlyIds,
} from "~/lib/supply-scan.server";
import { resolveUnitDisplayMode } from "~/lib/unit-display-mode";
import type { Route } from "./+types/supply-lists.$id.scan-complete";

/**
 * POST /api/supply-lists/:id/scan-complete
 * Docks confirmed receipt lines to Cargo and reconciles linked supply rows.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const env = context.cloudflare.env;
	const listId = params.id;
	if (!listId) throw data({ error: "List ID required" }, { status: 400 });

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	await assertFeatureEnabled(
		env,
		"ai-dock-from-receipt",
		buildFlagContext(request, env, { user }),
	);

	const rateLimitResult = await checkRateLimit(
		env.RATION_KV,
		"inventory_batch",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many requests. Please try again later.",
		);
	}

	try {
		const json = await request.json();
		const parsed = SupplyScanCompleteRequestSchema.safeParse(json);
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

		const userSettings = await getUserSettings(env.DB, user.id);
		const unitDisplayMode = resolveUnitDisplayMode(userSettings);

		return await completeSupplyScan(env, groupId, listId, parsed.data, {
			unitMode: unitDisplayMode,
			userId: user.id,
		});
	} catch (e) {
		if (e instanceof SupplyScanError) {
			const status =
				e.code === "list_not_found" || e.code === "job_not_found" ? 404 : 400;
			throw data({ error: e.message, code: e.code }, { status });
		}
		if (e instanceof CapacityExceededError) {
			throw data(
				{
					error: "capacity_exceeded",
					resource: e.resource,
					current: e.current,
					limit: e.limit,
					tier: e.tier,
					isExpired: e.isExpired,
					canAdd: e.canAdd,
					upgradePath: "crew_member",
				},
				{ status: 403 },
			);
		}
		return handleApiError(e);
	}
}
