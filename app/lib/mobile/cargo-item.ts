/**
 * JSON shape for `CargoItem` on iOS (`CreateCargoResponse` / cargo list).
 *
 * A 200 body that is missing `organizationId`, `status`, or `createdAt`, or
 * whose `nutrition` is a string or has a non-integer `fdcId`, decodes as
 * `APIError.decoding` — the banner "Unexpected response from server."
 * Auto-merge returns the cargo index row, which omits those fields, and a
 * user override is only present when nutrition is on (iOS always enables it).
 */

const NUTRIENT_KEYS = [
	"energyKcal",
	"proteinG",
	"fatG",
	"carbG",
	"fiberG",
	"sugarG",
	"satFatG",
	"sodiumMg",
	"saltG",
] as const;

export type MobileCargoTag = {
	id: string;
	slug: string;
	name: string;
	color: string | null;
	category: string | null;
};

export type MobileNutrientValues = {
	energyKcal: number | null;
	proteinG: number | null;
	fatG: number | null;
	carbG: number | null;
	fiberG: number | null;
	sugarG: number | null;
	satFatG: number | null;
	sodiumMg: number | null;
	saltG: number | null;
};

export type MobileCargoNutrition = {
	source: string;
	confidence: number;
	verified: boolean;
	per100g: MobileNutrientValues | null;
	perServing: MobileNutrientValues | null;
	fdcId: number | null;
	description: string | null;
};

export type MobileCargoItem = {
	id: string;
	organizationId: string;
	name: string;
	quantity: number;
	unit: string;
	baseQuantity: number;
	baseUnit: string;
	tags: MobileCargoTag[];
	domain: string;
	status: string;
	expiresAt: string | null;
	createdAt: string;
	updatedAt: string;
	nutrition: MobileCargoNutrition | null;
};

type CargoItemLike = {
	id: string;
	name: string;
	quantity?: unknown;
	unit?: unknown;
	domain?: unknown;
	organizationId?: unknown;
	status?: unknown;
	baseQuantity?: unknown;
	baseUnit?: unknown;
	expiresAt?: unknown;
	createdAt?: unknown;
	updatedAt?: unknown;
	nutrition?: unknown;
	tags?: unknown;
};

function finiteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function integerOrNull(value: unknown): number | null {
	const parsed = finiteNumber(value);
	if (parsed == null || !Number.isInteger(parsed)) return null;
	return parsed;
}

function isoDate(value: unknown, fallback: string): string {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString();
	}
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		const ms = Math.abs(value) > 10_000_000_000 ? value : value * 1000;
		const parsed = new Date(ms);
		if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
	}
	return fallback;
}

function optionalIso(value: unknown): string | null {
	if (value == null) return null;
	const fallback = isoDate(value, "");
	return fallback === "" ? null : fallback;
}

function parseMaybeJson(value: unknown): unknown {
	let current = value;
	for (let attempt = 0; attempt < 2 && typeof current === "string"; attempt++) {
		try {
			current = JSON.parse(current);
		} catch {
			return null;
		}
	}
	return current;
}

function nutrientsForMobile(value: unknown): MobileNutrientValues | null {
	const parsed = parseMaybeJson(value);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
	const record = parsed as Record<string, unknown>;
	const out = {} as MobileNutrientValues;
	for (const key of NUTRIENT_KEYS) {
		out[key] = finiteNumber(record[key]);
	}
	return out;
}

function nutritionForMobile(value: unknown): MobileCargoNutrition | null {
	const parsed = parseMaybeJson(value);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
	const snap = parsed as Record<string, unknown>;
	const per100g = nutrientsForMobile(snap.per100g);
	const perServing = nutrientsForMobile(snap.perServing);
	if (!per100g && !perServing && snap.source == null && snap.fdcId == null) {
		return null;
	}
	return {
		source: typeof snap.source === "string" ? snap.source : "user_override",
		confidence: finiteNumber(snap.confidence) ?? 1,
		verified: snap.verified === true || snap.verified === 1,
		per100g,
		perServing,
		fdcId: integerOrNull(snap.fdcId),
		description: typeof snap.description === "string" ? snap.description : null,
	};
}

function tagsForMobile(value: unknown): MobileCargoTag[] {
	const parsed = parseMaybeJson(value);
	if (!Array.isArray(parsed)) return [];
	const tags: MobileCargoTag[] = [];
	for (const entry of parsed) {
		if (typeof entry === "string" && entry.trim() !== "") {
			tags.push({
				id: entry,
				slug: entry,
				name: entry,
				color: null,
				category: null,
			});
			continue;
		}
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
		const record = entry as Record<string, unknown>;
		const slug =
			typeof record.slug === "string"
				? record.slug
				: typeof record.name === "string"
					? record.name
					: "";
		const id = typeof record.id === "string" ? record.id : slug;
		if (!id && !slug) continue;
		tags.push({
			id: id || slug,
			slug: slug || id,
			name: typeof record.name === "string" ? record.name : slug || id,
			color: typeof record.color === "string" ? record.color : null,
			category: typeof record.category === "string" ? record.category : null,
		});
	}
	return tags;
}

export function toMobileCargoItem(
	item: CargoItemLike,
	organizationId: string,
	now: Date = new Date(),
): MobileCargoItem {
	const fallback = now.toISOString();
	const quantity = finiteNumber(item.quantity) ?? 0;
	const unit =
		typeof item.unit === "string" && item.unit.trim() !== "" ? item.unit : "unit";
	const createdAt = isoDate(item.createdAt, isoDate(item.updatedAt, fallback));
	const updatedAt = isoDate(item.updatedAt, createdAt);
	const org =
		typeof item.organizationId === "string" && item.organizationId.trim() !== ""
			? item.organizationId
			: organizationId;
	return {
		id: item.id,
		organizationId: org,
		name: item.name,
		quantity,
		unit,
		baseQuantity: finiteNumber(item.baseQuantity) ?? quantity,
		baseUnit:
			typeof item.baseUnit === "string" && item.baseUnit.trim() !== ""
				? item.baseUnit
				: unit,
		tags: tagsForMobile(item.tags),
		domain:
			typeof item.domain === "string" && item.domain.trim() !== ""
				? item.domain
				: "food",
		status:
			typeof item.status === "string" && item.status.trim() !== ""
				? item.status
				: "stable",
		expiresAt: optionalIso(item.expiresAt),
		createdAt,
		updatedAt,
		nutrition: nutritionForMobile(item.nutrition),
	};
}
