import { data } from "react-router";
import { z } from "zod";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import { cookMealFromGalley } from "~/lib/galley-cook-manifest.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { SLOT_TYPES } from "~/lib/schemas/manifest";
import { tryStoreUndoToken } from "~/lib/undo-token.server";
import type { Route } from "./+types/meals.$id.cook";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const CookRequestSchema = z.object({
	servings: z.coerce.number().int().min(1).optional(),
	confirmInsufficient: z.boolean().optional(),
	/** Local calendar date — enables Manifest bridge when nutrition-cook-log-split is on. */
	date: z.string().regex(ISO_DATE_REGEX).optional(),
	slotType: z.enum(SLOT_TYPES).optional(),
	localHour: z.coerce.number().int().min(0).max(23).optional(),
});

export async function action({ request, params, context }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const { id } = params;

	if (!id) throw data({ error: "Not Found" }, { status: 404 });

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

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	let servings: number | undefined;
	let confirmInsufficient: boolean | undefined;
	let date: string | undefined;
	let slotType: (typeof SLOT_TYPES)[number] | undefined;
	let localHour: number | undefined;
	try {
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
		} else {
			const formData = await request.formData();
			const parsed = CookRequestSchema.safeParse({
				servings: formData.get("servings") ?? undefined,
				confirmInsufficient:
					formData.get("confirmInsufficient") === "true" ? true : undefined,
				date: formData.get("date") ?? undefined,
				slotType: formData.get("slotType") ?? undefined,
				localHour: formData.get("localHour") ?? undefined,
			});
			if (parsed.success) {
				servings = parsed.data.servings;
				confirmInsufficient = parsed.data.confirmInsufficient;
				date = parsed.data.date;
				slotType = parsed.data.slotType;
				localHour = parsed.data.localHour;
			}
		}
	} catch {
		// Unparseable body — proceed without overrides
	}

	try {
		const flagContext = buildWebFlagContext(request, context.cloudflare.env, {
			user,
		});
		const result = await cookMealFromGalley(
			context.cloudflare.env,
			groupId,
			id,
			{
				flagContext,
				servings,
				confirmInsufficient,
				userId: user.id,
				source: "web",
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
				(result.deductions.length > 0 || result.autoCreated)
			) {
				undoToken = await tryStoreUndoToken(context.cloudflare.env.RATION_KV, {
					userId: user.id,
					organizationId: groupId,
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
				userId: user.id,
				organizationId: groupId,
				kind: "cook",
				deductions: result.deductions,
				eventIds: result.eventIds,
			});
		}

		return {
			result: {
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
			},
		};
	} catch (e) {
		return handleApiError(e);
	}
}
