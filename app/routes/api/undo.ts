import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import {
	NutritionUndoUnavailableError,
	undoIntake,
} from "~/lib/nutrition/service.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { UndoActionSchema } from "~/lib/schemas/mobile/undo";
import { deleteUndoToken, loadUndoToken } from "~/lib/undo-token.server";
import type { Route } from "./+types/undo";

/**
 * POST /api/undo — Reverse a recent cook/consume/intake mutation.
 * Intake undos are D1-backed (`operationId`); cook/consume still use KV tokens.
 */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const {
			groupId,
			session: { user },
		} = await requireActiveGroup(context, request);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_mutation",
			user.id,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const body = await request.json();
		const { token } = UndoActionSchema.parse(body);
		const principal = {
			userId: user.id,
			organizationId: groupId,
			surface: "web" as const,
			authMethod: "session",
			scopes: ["nutrition:write"],
			requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
		};
		const flagContext = buildWebFlagContext(request, context.cloudflare.env, {
			user,
		});
		try {
			const result = await undoIntake(
				context.cloudflare.env,
				principal,
				flagContext,
				token,
			);
			return { success: true, kind: "manifest_intake", ...result };
		} catch (error) {
			if (
				!(error instanceof NutritionUndoUnavailableError) ||
				!error.fallbackAllowed
			) {
				throw error;
			}
		}

		const record = await loadUndoToken(
			context.cloudflare.env.RATION_KV,
			token,
			user.id,
			groupId,
		);
		if (!record) {
			throw data({ error: "Undo expired or unavailable" }, { status: 410 });
		}
		const { applyUndoRecord } = await import("~/lib/cook-reversal.server");
		await applyUndoRecord(context.cloudflare.env.DB, groupId, record, {
			kv: context.cloudflare.env.RATION_KV,
		});
		await deleteUndoToken(context.cloudflare.env.RATION_KV, token);
		return { success: true, kind: record.kind };
	} catch (e) {
		return handleApiError(e);
	}
}
