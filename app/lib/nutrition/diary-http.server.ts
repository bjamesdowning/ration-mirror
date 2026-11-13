import { type AppLoadContext, data } from "react-router";
import { z } from "zod";
import {
	buildMobileFlagContext,
	buildWebFlagContext,
} from "~/lib/feature-flags/flags.server";
import { InsufficientCreditsError } from "~/lib/ledger.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import {
	DiaryFoodWriteSchema,
	DiaryKitchenSaveSchema,
	DiaryVoidSchema,
} from "~/lib/schemas/diary";
import {
	FUEL_PHOTO_MAX_BYTES,
	FuelBarcodeSchema,
	FuelPhotoContentTypeSchema,
	FuelTimeZoneSchema,
} from "~/lib/schemas/fuel";
import { UuidSchema } from "~/lib/schemas/uuid";
import {
	exportDiaryFood,
	logDiaryFood,
	quoteFoodLog,
	saveDiaryFoodToKitchen,
	updateDiaryFood,
	voidDiaryFood,
} from "./diary.server";
import {
	assertNutritionBarcodeDiary,
	isNutritionFuelPageEnabled,
} from "./fast-log-flag.server";
import { lookupFoodBarcode } from "./food-barcode.server";
import { assertFuelCreateRoom } from "./fuel-cap.server";
import {
	confirmFuelPhoto,
	readFuelPhoto,
	submitFuelPhoto,
} from "./fuel-photo.server";
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
	bucket: "settings_mutation" | "api_export" | "scan" | "barcode_lookup",
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
	const bearer =
		request.headers.get("Authorization")?.startsWith("Bearer ") === true;
	const principal: NutritionPrincipal = {
		userId: auth.userId,
		organizationId: auth.groupId,
		surface,
		authMethod: bearer ? "mobile_bearer" : "session",
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

async function rejectInvalidDiary(
	env: Env,
	flags: NutritionFlagContext,
	parsed: { error: { flatten: () => unknown } },
): Promise<never> {
	if (await isNutritionFuelPageEnabled(env, flags)) {
		throw data({ code: "invalid_request" }, { status: 400 });
	}
	throw data(
		{ error: "Invalid request", details: parsed.error.flatten() },
		{ status: 400 },
	);
}

export async function postDiaryLog(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	const parsed = DiaryFoodWriteSchema.safeParse(await readBody(request));
	if (!parsed.success) return rejectInvalidDiary(env, flags, parsed);
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
	barcode: FuelBarcodeSchema,
	fuelTimeZone: FuelTimeZoneSchema.optional(),
});

const ProposeFoodLogSchema = z.object({
	operationKey: UuidSchema,
	photoRef: z.string().trim().min(1).max(8_000_000).optional(),
	subject: z.enum(["packaged", "meal", "loose_produce", "custom"]).optional(),
	barcode: FuelBarcodeSchema.optional(),
});

function clientIp(request: Request): string {
	return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

export async function postFoodBarcode(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	await assertNutritionBarcodeDiary(env, flags);
	const userLimit = await checkRateLimit(
		env.RATION_KV,
		"barcode_lookup",
		principal.userId,
	);
	if (!userLimit.allowed) throw rateLimitResponse(userLimit);
	const ipLimit = await checkRateLimit(
		env.RATION_KV,
		"barcode_lookup",
		`ip:${clientIp(request)}`,
	);
	if (!ipLimit.allowed) throw rateLimitResponse(ipLimit);
	const parsed = FoodBarcodeSchema.safeParse(await readBody(request));
	if (!parsed.success) {
		throw data({ code: "invalid_request" }, { status: 400 });
	}
	if (await isNutritionFuelPageEnabled(env, flags)) {
		await assertFuelCreateRoom(
			env.DB,
			principal.userId,
			new Date(),
			new Date(),
			parsed.data.fuelTimeZone,
		);
	}
	return lookupFoodBarcode(env, parsed.data.barcode);
}

export async function postProposeFoodLog(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	if (await isNutritionFuelPageEnabled(env, flags)) {
		throw data(
			{
				error: "Scan to Fuel uses the photo queue.",
				code: "FEATURE_DISABLED",
			},
			{ status: 403 },
		);
	}
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
	if (!parsed.success) return rejectInvalidDiary(env, flags, parsed);
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
	if (!parsed.success) return rejectInvalidDiary(env, flags, parsed);
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

function mapFuelPhotoConsent(error: unknown): never {
	const code =
		error && typeof error === "object" && "code" in error
			? String((error as { code: unknown }).code)
			: "";
	if (
		code === "nutrition_consent_required" ||
		code === "nutrition_reconsent_required" ||
		code === "ai_consent_required"
	) {
		throw data({ code: "consent_required" }, { status: 403 });
	}
	throw error;
}

function decodePhoto(imageBase64: string): ArrayBuffer {
	const binary = atob(imageBase64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer;
}

const FuelPhotoSubmitSchema = z.object({
	operationKey: UuidSchema,
	contentType: FuelPhotoContentTypeSchema,
	imageBase64: z.string().min(1),
	fuelTimeZone: FuelTimeZoneSchema.optional(),
});

export async function postFuelPhoto(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	const scanLimit = await checkRateLimit(
		env.RATION_KV,
		"scan",
		principal.userId,
	);
	if (!scanLimit.allowed) throw rateLimitResponse(scanLimit);
	const contentLength = Number(request.headers.get("content-length") ?? "0");
	if (contentLength > FUEL_PHOTO_MAX_BYTES * 2) {
		throw data(
			{
				error: "Photo must be 3 MiB or smaller.",
				code: "photo_too_large",
			},
			{ status: 400 },
		);
	}
	const parsed = FuelPhotoSubmitSchema.safeParse(await readBody(request));
	if (!parsed.success) throw data({ code: "invalid_request" }, { status: 400 });
	let bytes: ArrayBuffer;
	try {
		bytes = decodePhoto(parsed.data.imageBase64);
	} catch {
		throw data({ code: "invalid_request" }, { status: 400 });
	}
	try {
		return await submitFuelPhoto(env, principal, flags, {
			operationKey: parsed.data.operationKey,
			contentType: parsed.data.contentType,
			bytes,
			fuelTimeZone: parsed.data.fuelTimeZone,
		});
	} catch (error) {
		if (error instanceof InsufficientCreditsError) {
			throw data(
				{
					error: "Insufficient credits",
					code: "insufficient_credits",
					required: error.required,
					current: error.current,
				},
				{ status: 402 },
			);
		}
		mapFuelPhotoConsent(error);
	}
}

export async function getFuelPhoto(
	env: Env,
	principal: NutritionPrincipal,
	requestId: string,
) {
	try {
		return await readFuelPhoto(env, principal.userId, requestId);
	} catch (error) {
		mapFuelPhotoConsent(error);
	}
}

export async function postFuelPhotoConfirm(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	requestId: string,
) {
	const parsed = DiaryFoodWriteSchema.safeParse(await readBody(request));
	if (!parsed.success) throw data({ code: "invalid_request" }, { status: 400 });
	try {
		return await confirmFuelPhoto(
			env,
			principal,
			flags,
			requestId,
			parsed.data,
		);
	} catch (error) {
		mapFuelPhotoConsent(error);
	}
}
