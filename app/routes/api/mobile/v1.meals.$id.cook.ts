import { data } from "react-router";
import { z } from "zod";
import { handleApiError } from "~/lib/error-handler";
import { buildFlagContext } from "~/lib/feature-flags/context.server";
import { cookMealFromGalley } from "~/lib/galley-cook-manifest.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { SLOT_TYPES } from "~/lib/schemas/manifest";
import { tryStoreUndoToken } from "~/lib/undo-token.server";
import type { Route } from "./+types/v1.meals.$id.cook";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const CookRequestSchema = z.object({
	servings: z.coerce.number().int().min(1).optional(),
	confirmInsufficient: z.boolean().optional(),
	date: z.string().regex(ISO_DATE_REGEX).optional(),
	slotType: z.enum(SLOT_TYPES).optional(),
	localHour: z.coerce.number().int().min(0).max(23).optional(),
});

export async function action({ request, context, params }: Route.ActionArgs) {
	const id = params.id;
	if (!id) throw data({ error: "Not Found" }, { status: 404 });

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		let servings: number | undefined;
		let confirmInsufficient: boolean | undefined;
		let date: string | undefined;
		let slotType: (typeof SLOT_TYPES)[number] | undefined;
		let localHour: number | undefined;
		const contentType = request.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			const json = await request.json();
			const parsed = CookRequestSchema.safeParse(json);
			if (parsed.success) {
				servings = parsed.data.servings;
				confirmInsufficient = parsed.data.confirmInsufficient;
				date = parsed.data.date;
				slotType = parsed.data.slotType;
				localHour = parsed.data.localHour;
			}
		}

		const flagContext = buildFlagContext(request, context.cloudflare.env, {
			user: { id: userId },
		});

		const result = await cookMealFromGalley(
			context.cloudflare.env,
			organizationId,
			id,
			{
				flagContext,
				servings,
				confirmInsufficient,
				userId,
				source: "mobile",
				date,
				slotType,
				localHour,
			},
		);

		let undoToken: string | undefined;
		if (result.bridgedToManifest && result.cooked && result.planId) {
			const entryIds = result.manifestEntryIds ?? [];
			if (
				entryIds.length > 0 &&
				(result.deductions.length > 0 ||
					result.autoCreated ||
					(result.eventIds?.length ?? 0) > 0)
			) {
				undoToken = await tryStoreUndoToken(context.cloudflare.env.RATION_KV, {
					userId,
					organizationId,
					kind: "manifest_cook",
					deductions: result.deductions,
					manifestEntryIds: entryIds,
					planId: result.planId,
					eventIds: result.eventIds,
					deleteManifestEntryIds: result.autoCreated ? entryIds : undefined,
				});
			}
		} else if (
			!result.bridgedToManifest &&
			(result.deductions.length > 0 || (result.eventIds?.length ?? 0) > 0)
		) {
			undoToken = await tryStoreUndoToken(context.cloudflare.env.RATION_KV, {
				userId,
				organizationId,
				kind: "cook",
				deductions: result.deductions,
				eventIds: result.eventIds,
			});
		}

		return {
			cooked: result.cooked,
			ingredientsDeducted: result.ingredientsDeducted,
			servings: result.servings,
			deductions: result.deductions,
			requiresConfirmation: result.requiresConfirmation,
			missingIngredients: result.missingIngredients,
			partialCook: result.partialCook,
			skippedIngredients: result.skippedIngredients,
			bridgedToManifest: result.bridgedToManifest,
			offerPersonalLog: result.offerPersonalLog,
			autoCreated: result.autoCreated,
			entry: result.entry,
			planId: result.planId,
			undoToken,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
