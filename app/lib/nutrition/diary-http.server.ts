import { type AppLoadContext, data } from "react-router";
import { z } from "zod";
import {
	buildMobileFlagContext,
	buildWebFlagContext,
} from "~/lib/feature-flags/flags.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import {
	DiaryFoodWriteSchema,
	DiaryKitchenSaveSchema,
	DiaryVoidSchema,
} from "~/lib/schemas/diary";
import { UuidSchema } from "~/lib/schemas/uuid";
import {
	exportDiaryFood,
	logDiaryFood,
	quoteFoodLog,
	saveDiaryFoodToKitchen,
	updateDiaryFood,
	voidDiaryFood,
} from "./diary.server";
import { assertNutritionBarcodeDiary } from "./fast-log-flag.server";
import { lookupFoodBarcode } from "./food-barcode.server";
import { proposeFoodLog } from "./propose-food-log.server";
import type {
	NutritionFlagContext,
	NutritionPrincipal,
} from "./service.server";
import { resolveHttpOperationKey } from "./service.server";

export async function beginDiaryRequest(
	request: Request,
	context: AppLoadContext,
	auth: { groupId: string; userId: string },
	surface: "web" | "mobile",
	bucket: "settings_mutation" | "api_export",
) {
	const env = context.cloudflare.env;
	const rateLimitResult = await checkRateLimit(
		env.RATION_KV,
		bucket,
		auth.userId,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many requests. Please try again later.",
		);
	}
	const session = { user: { id: auth.userId } };
	const flags: NutritionFlagContext =
		surface === "web"
			? buildWebFlagContext(request, env, session)
			: buildMobileFlagContext(request, env, session);
	const principal: NutritionPrincipal = {
		userId: auth.userId,
		organizationId: auth.groupId,
		surface,
		authMethod: "session",
		scopes: ["nutrition:read", "nutrition:write"],
		requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
	};
	return { env, flags, principal };
}

async function readBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw data({ error: "Invalid request" }, { status: 400 });
	}
}

export async function postDiaryLog(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	const parsed = DiaryFoodWriteSchema.safeParse(await readBody(request));
	if (!parsed.success) {
		throw data(
			{ error: "Invalid request", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}
	const operationKey = resolveHttpOperationKey(
		request.headers,
		parsed.data.operationKey,
	);
	return logDiaryFood(env, principal, flags, {
		...parsed.data,
		operationKey,
	});
}

const FoodBarcodeSchema = z.object({
	barcode: z.string().trim().min(4).max(32),
});

const ProposeFoodLogSchema = z.object({
	operationKey: UuidSchema,
	photoRef: z.string().trim().min(1).max(8_000_000).optional(),
	subject: z.enum(["packaged", "meal", "loose_produce", "custom"]).optional(),
	barcode: z.string().trim().min(4).max(32).optional(),
});

export async function postFoodBarcode(
	request: Request,
	env: Env,
	flags: NutritionFlagContext,
) {
	await assertNutritionBarcodeDiary(env, flags);
	const parsed = FoodBarcodeSchema.safeParse(await readBody(request));
	if (!parsed.success) {
		throw data({ error: "Invalid request" }, { status: 400 });
	}
	return lookupFoodBarcode(env, parsed.data.barcode);
}

export async function postProposeFoodLog(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	const parsed = ProposeFoodLogSchema.safeParse(await readBody(request));
	if (!parsed.success) {
		throw data({ error: "Invalid request" }, { status: 400 });
	}
	const operationKey = resolveHttpOperationKey(
		request.headers,
		parsed.data.operationKey,
	);
	return proposeFoodLog(env, principal, flags, {
		...parsed.data,
		operationKey,
	});
}

export async function patchDiaryLog(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	intakeId: string,
) {
	const parsed = DiaryFoodWriteSchema.safeParse(await readBody(request));
	if (!parsed.success) {
		throw data(
			{ error: "Invalid request", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}
	const operationKey = resolveHttpOperationKey(
		request.headers,
		parsed.data.operationKey,
	);
	return updateDiaryFood(env, principal, flags, intakeId, {
		...parsed.data,
		operationKey,
	});
}

export async function deleteDiaryLog(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	intakeId: string,
) {
	const parsed = DiaryVoidSchema.safeParse(await readBody(request));
	if (!parsed.success) {
		throw data(
			{ error: "Invalid request", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}
	const operationKey = resolveHttpOperationKey(
		request.headers,
		parsed.data.operationKey,
	);
	return voidDiaryFood(env, principal, flags, intakeId, {
		confirm: parsed.data.confirm,
		operationKey,
	});
}

export async function postDiaryKitchenSave(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	intakeId: string,
) {
	const parsed = DiaryKitchenSaveSchema.safeParse(await readBody(request));
	if (!parsed.success) {
		throw data(
			{ error: "Invalid request", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}
	const operationKey = resolveHttpOperationKey(
		request.headers,
		parsed.data.operationKey,
	);
	return saveDiaryFoodToKitchen(env, principal, flags, intakeId, {
		confirm: parsed.data.confirm,
		target: parsed.data.target,
		operationKey,
	});
}

export async function getDiaryExport(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	return exportDiaryFood(env, principal, flags);
}

export async function postDiaryQuote(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	return quoteFoodLog(env, principal, flags);
}
