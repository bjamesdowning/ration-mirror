import {
	and,
	asc,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	like,
	lt,
	or,
	sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	activeMealSelection,
	cargo,
	meal,
	mealIngredient,
	mealTag,
	tag as tagTable,
} from "../db/schema";
import { computeBaseFields, effectiveBaseFields } from "./base-quantity";
import { checkCapacity } from "./capacity.server";
import { type CargoIndexRow, fetchOrgCargoIndex } from "./cargo-index.server";
import { isCargoUsableForMatching } from "./cargo-utils";
import { ITEM_DOMAINS } from "./domain";
import { normalizeForCargoDedup } from "./matching";
import type { MissingIngredientDetail } from "./matching.server";
import {
	chunkArray,
	chunkedQuery,
	D1_MAX_BOUND_PARAMS,
	D1_MAX_INGREDIENT_ROWS_PER_STATEMENT,
	D1_MAX_TAG_ROWS_PER_STATEMENT,
} from "./query-utils.server";
import { getScaleFactor, scaleQuantity } from "./scale.server";
import type {
	MealInput,
	ProvisionInput,
	ProvisionUpdateInput,
} from "./schemas/meal";
import { dedupeTagSlugs } from "./tags";
import {
	getOrganizationTagSlugs,
	getTagsForCargoIds,
	getTagsForMealIds,
	resolveTagIds,
	type TagRecord,
	tagsToSlugs,
} from "./tags.server";
import { trackD1BatchSize, trackWriteOperation } from "./telemetry.server";
import {
	convertIngredientAmount,
	type SupportedUnit,
	toSupportedUnit,
} from "./units";
import {
	findSimilarCargoBatch,
	SIMILARITY_THRESHOLDS,
	type SimilarCargoMatch,
} from "./vector.server";

export type { TagRecord };

export type CargoDeduction = { cargoId: string; quantity: number };

export type CookMealDeductionMode = "strict" | "partial";

export type MealWriteOptions = {
	/** Pre-resolved slug → tag id map from a bulk resolveTagIds call. */
	tagIdsBySlug?: Map<string, string>;
	/** Skip trailing getMeal() when the caller only needs success/failure. */
	skipReturnRead?: boolean;
};

async function resolveMealTagIds(
	db: D1Database,
	organizationId: string,
	slugs: string[],
	options?: MealWriteOptions,
): Promise<string[]> {
	if (slugs.length === 0) return [];
	if (options?.tagIdsBySlug) {
		const normalized = dedupeTagSlugs(slugs);
		return normalized.map((slug) => {
			const id = options.tagIdsBySlug?.get(slug);
			if (!id) {
				throw new Error(`tag_not_resolved:${slug}`);
			}
			return id;
		});
	}
	return resolveTagIds(db, organizationId, slugs);
}

export type CargoDeductionPlan = {
	allocations: { cargoId: string; quantityToDeduct: number }[];
	shortfallInTargetUnit: number;
};

function recordCargoDeduction(
	deductions: CargoDeduction[],
	cargoId: string,
	quantity: number,
): void {
	if (quantity <= 0) return;
	const existing = deductions.find((d) => d.cargoId === cargoId);
	if (existing) {
		existing.quantity += quantity;
	} else {
		deductions.push({ cargoId, quantity });
	}
}

function mealIngredientValues(
	mealId: string,
	ing: {
		cargoId?: string | null;
		ingredientName: string;
		quantity: number;
		unit: string;
		isOptional?: boolean | null;
	},
	orderIndex: number,
	id?: string,
) {
	const base = computeBaseFields(ing.quantity, ing.unit, ing.ingredientName);
	return {
		...(id ? { id } : {}),
		mealId,
		cargoId: ing.cargoId,
		ingredientName: ing.ingredientName,
		quantity: ing.quantity,
		unit: ing.unit,
		baseQuantity: base.baseQuantity,
		baseUnit: base.baseUnit,
		isOptional: ing.isOptional,
		orderIndex,
	};
}

/** Maximum number of meals allowed in a single batch create. */
export const MAX_BATCH_MEALS = 10;

/**
 * Count meals for an organization, optionally filtered by tag or domain.
 * Used for pagination total. Matches filters used by getMeals.
 */
export async function getMealsCount(
	db: D1Database,
	organizationId: string,
	tag?: string,
	domain?: (typeof meal.$inferSelect)["domain"],
): Promise<number> {
	const d1 = drizzle(db);
	const conditions = [eq(meal.organizationId, organizationId)];
	if (domain) {
		conditions.push(eq(meal.domain, domain));
	}
	if (tag) {
		const [row] = await d1
			.select({
				count: sql<number>`count(distinct ${meal.id})`,
			})
			.from(meal)
			.innerJoin(mealTag, eq(meal.id, mealTag.mealId))
			.innerJoin(tagTable, eq(mealTag.tagId, tagTable.id))
			.where(and(...conditions, eq(tagTable.slug, tag)));
		return Number(row?.count ?? 0);
	}
	const [row] = await d1
		.select({ count: sql<number>`count(*)` })
		.from(meal)
		.where(and(...conditions));
	return Number(row?.count ?? 0);
}

/**
 * Retrieves meals for an organization, optionally filtered by tag or domain.
 * Returns meals with their associated tags and ingredients.
 *
 * Pagination: pass `limit` and `offset` for page/cursor-based loading.
 * Omit both to fetch all rows (needed by exports, galley import, and AI generation).
 */
export async function getMeals(
	db: D1Database,
	organizationId: string,
	tag?: string,
	domain?: (typeof meal.$inferSelect)["domain"],
	options?: { limit?: number; offset?: number; searchQuery?: string },
) {
	const d1 = drizzle(db);
	const conditions = [eq(meal.organizationId, organizationId)];
	const tagSlug = tag;
	if (tagSlug) {
		conditions.push(eq(tagTable.slug, tagSlug));
	}
	if (domain) {
		conditions.push(eq(meal.domain, domain));
	}
	if (options?.searchQuery) {
		const q = options.searchQuery.trim();
		conditions.push(like(meal.name, `%${q}%`));
	}

	// Base query to get meals
	const meals = tagSlug
		? await d1
				.select({
					id: meal.id,
					organizationId: meal.organizationId,
					name: meal.name,
					domain: meal.domain,
					type: meal.type,
					description: meal.description,
					directions: meal.directions,
					equipment: meal.equipment,
					servings: meal.servings,
					prepTime: meal.prepTime,
					cookTime: meal.cookTime,
					customFields: meal.customFields,
					createdAt: meal.createdAt,
					updatedAt: meal.updatedAt,
				})
				.from(meal)
				.innerJoin(mealTag, eq(meal.id, mealTag.mealId))
				.innerJoin(tagTable, eq(mealTag.tagId, tagTable.id))
				.where(and(...conditions))
				.orderBy(desc(meal.createdAt))
				.$dynamic()
				.limit(options?.limit ?? Number.MAX_SAFE_INTEGER)
				.offset(options?.offset ?? 0)
		: await d1
				.select({
					id: meal.id,
					organizationId: meal.organizationId,
					name: meal.name,
					domain: meal.domain,
					type: meal.type,
					description: meal.description,
					directions: meal.directions,
					equipment: meal.equipment,
					servings: meal.servings,
					prepTime: meal.prepTime,
					cookTime: meal.cookTime,
					customFields: meal.customFields,
					createdAt: meal.createdAt,
					updatedAt: meal.updatedAt,
				})
				.from(meal)
				.where(and(...conditions))
				.orderBy(desc(meal.createdAt))
				.$dynamic()
				.limit(options?.limit ?? Number.MAX_SAFE_INTEGER)
				.offset(options?.offset ?? 0);

	if (meals.length === 0) {
		return [];
	}

	// Fetch all tags and ingredients for the organization's meals in one query each
	const mealIds = meals.map((m) => m.id);
	const [tagsByMealId, allIngredients] = await Promise.all([
		getTagsForMealIds(db, mealIds),
		chunkedQuery(mealIds, (chunk) =>
			d1
				.select()
				.from(mealIngredient)
				.where(inArray(mealIngredient.mealId, chunk))
				.orderBy(mealIngredient.orderIndex),
		),
	]);

	// Group ingredients by meal ID
	const ingredientsByMealId = new Map<
		string,
		(typeof mealIngredient.$inferSelect)[]
	>();
	for (const ing of allIngredients) {
		const existing = ingredientsByMealId.get(ing.mealId) || [];
		existing.push(ing);
		ingredientsByMealId.set(ing.mealId, existing);
	}

	// Return meals with tags and ingredients attached
	return meals.map((m) => ({
		...m,
		tags: tagsByMealId.get(m.id) || [],
		ingredients: ingredientsByMealId.get(m.id) || [],
	}));
}

/**
 * Cursor-paginated meal fetch using `(createdAt desc, id asc)` ordering.
 *
 * Mirrors `getMeals` filters (tag, domain) but returns at most `limit` rows
 * and a `nextCursor` if more remain. The caller encodes/decodes the cursor
 * (see `app/lib/mcp/envelope.ts`).
 *
 * Set `includeIngredients: false` to skip the ingredient fan-out — useful for
 * agents that only need the index of meal names/ids.
 */
export async function getMealsPage(
	db: D1Database,
	organizationId: string,
	options: {
		limit: number;
		cursor?: { createdAt: Date; id: string } | null;
		tag?: string;
		domain?: (typeof meal.$inferSelect)["domain"];
		includeIngredients?: boolean;
	},
) {
	const d1 = drizzle(db);
	const includeIngredients = options.includeIngredients ?? true;
	const conditions = [eq(meal.organizationId, organizationId)];
	const tagSlug = options.tag;
	if (tagSlug) conditions.push(eq(tagTable.slug, tagSlug));
	if (options.domain) conditions.push(eq(meal.domain, options.domain));
	if (options.cursor) {
		const cursorClause = or(
			lt(meal.createdAt, options.cursor.createdAt),
			and(
				eq(meal.createdAt, options.cursor.createdAt),
				gt(meal.id, options.cursor.id),
			),
		);
		if (cursorClause) conditions.push(cursorClause);
	}

	const projection = {
		id: meal.id,
		organizationId: meal.organizationId,
		name: meal.name,
		domain: meal.domain,
		type: meal.type,
		description: meal.description,
		directions: meal.directions,
		equipment: meal.equipment,
		servings: meal.servings,
		prepTime: meal.prepTime,
		cookTime: meal.cookTime,
		customFields: meal.customFields,
		createdAt: meal.createdAt,
		updatedAt: meal.updatedAt,
	} as const;

	const rows = tagSlug
		? await d1
				.select(projection)
				.from(meal)
				.innerJoin(mealTag, eq(meal.id, mealTag.mealId))
				.innerJoin(tagTable, eq(mealTag.tagId, tagTable.id))
				.where(and(...conditions))
				.orderBy(desc(meal.createdAt), asc(meal.id))
				.limit(options.limit + 1)
		: await d1
				.select(projection)
				.from(meal)
				.where(and(...conditions))
				.orderBy(desc(meal.createdAt), asc(meal.id))
				.limit(options.limit + 1);

	const hasMore = rows.length > options.limit;
	const meals = hasMore ? rows.slice(0, options.limit) : rows;
	const last = meals[meals.length - 1];
	const nextCursor =
		hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;

	if (meals.length === 0) {
		return {
			items: [] as Array<
				(typeof meals)[number] & {
					tags: TagRecord[];
					ingredients: (typeof mealIngredient.$inferSelect)[];
				}
			>,
			nextCursor,
		};
	}

	const mealIds = meals.map((m) => m.id);
	const [tagsByMealId, allIngredients] = await Promise.all([
		getTagsForMealIds(db, mealIds),
		includeIngredients
			? chunkedQuery(mealIds, (chunk) =>
					d1
						.select()
						.from(mealIngredient)
						.where(inArray(mealIngredient.mealId, chunk))
						.orderBy(mealIngredient.orderIndex),
				)
			: Promise.resolve([] as (typeof mealIngredient.$inferSelect)[]),
	]);

	const ingredientsByMealId = new Map<
		string,
		(typeof mealIngredient.$inferSelect)[]
	>();
	for (const ing of allIngredients) {
		const existing = ingredientsByMealId.get(ing.mealId) || [];
		existing.push(ing);
		ingredientsByMealId.set(ing.mealId, existing);
	}

	const items = meals.map((m) => ({
		...m,
		tags: tagsByMealId.get(m.id) || [],
		ingredients: includeIngredients ? ingredientsByMealId.get(m.id) || [] : [],
	}));
	return { items, nextCursor };
}

/**
 * Retrieves a single meal by ID, including its ingredients and tags.
 * Uses a batch query to avoid N+1 issues and reduce round-trips.
 */
export async function getMeal(
	db: D1Database,
	organizationId: string,
	mealId: string,
) {
	const d1 = drizzle(db);

	const [mealResults, ingredients] = await d1.batch([
		d1
			.select()
			.from(meal)
			.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId))),
		d1
			.select()
			.from(mealIngredient)
			.where(eq(mealIngredient.mealId, mealId))
			.orderBy(mealIngredient.orderIndex),
	]);

	const foundMeal = mealResults[0];
	if (!foundMeal) return null;

	const tagsByMealId = await getTagsForMealIds(db, [mealId]);

	return {
		...foundMeal,
		ingredients,
		tags: tagsByMealId.get(mealId) ?? [],
	};
}

/**
 * Returns the IDs of the previous and next meals in the org-scoped list
 * (ordered by createdAt desc, id asc for tie-breaker).
 * Supports optional tag and domain filters matching getMeals.
 */
export async function getAdjacentMealIds(
	db: D1Database,
	organizationId: string,
	current: { id: string; createdAt: Date },
	filters: { tag?: string; domain?: string },
): Promise<{ prevId: string | null; nextId: string | null }> {
	const d1 = drizzle(db);
	const tagSlug = filters.tag?.trim().slice(0, 100);
	const domain =
		filters.domain &&
		ITEM_DOMAINS.includes(filters.domain as (typeof ITEM_DOMAINS)[number])
			? filters.domain
			: undefined;

	const baseConditions = [eq(meal.organizationId, organizationId)];
	if (domain) {
		baseConditions.push(eq(meal.domain, domain));
	}
	if (tagSlug) {
		baseConditions.push(eq(tagTable.slug, tagSlug));
	}
	const baseWhere = and(...baseConditions);

	const prevCursorCondition = or(
		gt(meal.createdAt, current.createdAt),
		and(eq(meal.createdAt, current.createdAt), lt(meal.id, current.id)),
	);
	const nextCursorCondition = or(
		lt(meal.createdAt, current.createdAt),
		and(eq(meal.createdAt, current.createdAt), gt(meal.id, current.id)),
	);

	if (tagSlug) {
		const prevQuery = d1
			.select({ id: meal.id })
			.from(meal)
			.innerJoin(mealTag, eq(meal.id, mealTag.mealId))
			.innerJoin(tagTable, eq(mealTag.tagId, tagTable.id))
			.where(and(baseWhere, prevCursorCondition))
			.orderBy(asc(meal.createdAt), desc(meal.id))
			.limit(1);
		const nextQuery = d1
			.select({ id: meal.id })
			.from(meal)
			.innerJoin(mealTag, eq(meal.id, mealTag.mealId))
			.innerJoin(tagTable, eq(mealTag.tagId, tagTable.id))
			.where(and(baseWhere, nextCursorCondition))
			.orderBy(desc(meal.createdAt), asc(meal.id))
			.limit(1);
		const [prevResult, nextResult] = await d1.batch([prevQuery, nextQuery]);
		return {
			prevId: prevResult[0]?.id ?? null,
			nextId: nextResult[0]?.id ?? null,
		};
	}

	const prevQuery = d1
		.select({ id: meal.id })
		.from(meal)
		.where(and(baseWhere, prevCursorCondition))
		.orderBy(asc(meal.createdAt), desc(meal.id))
		.limit(1);
	const nextQuery = d1
		.select({ id: meal.id })
		.from(meal)
		.where(and(baseWhere, nextCursorCondition))
		.orderBy(desc(meal.createdAt), asc(meal.id))
		.limit(1);
	const [prevResult, nextResult] = await d1.batch([prevQuery, nextQuery]);
	return {
		prevId: prevResult[0]?.id ?? null,
		nextId: nextResult[0]?.id ?? null,
	};
}

export type MealIngredientConnectionType = "direct" | "name_match";

export interface ConnectedMealIngredient {
	id: string;
	mealId: string;
	cargoId: string | null;
	ingredientName: string;
	quantity: number;
	unit: string;
	isOptional: boolean | null;
	orderIndex: number | null;
	connectionType: MealIngredientConnectionType;
}

/**
 * Retrieves meals that reference a cargo item either by direct cargoId link
 * or by case-insensitive ingredient name match (for unlinked ingredients).
 */
export async function getMealsForCargo(
	db: D1Database,
	organizationId: string,
	cargoId: string,
	cargoName: string,
) {
	const d1 = drizzle(db);
	const normalizedName = cargoName.trim().toLowerCase();

	const [directRows, nameRows] = await d1.batch([
		d1
			.select({
				id: mealIngredient.id,
				mealId: mealIngredient.mealId,
				cargoId: mealIngredient.cargoId,
				ingredientName: mealIngredient.ingredientName,
				quantity: mealIngredient.quantity,
				unit: mealIngredient.unit,
				isOptional: mealIngredient.isOptional,
				orderIndex: mealIngredient.orderIndex,
			})
			.from(mealIngredient)
			.innerJoin(meal, eq(mealIngredient.mealId, meal.id))
			.where(
				and(
					eq(meal.organizationId, organizationId),
					eq(mealIngredient.cargoId, cargoId),
				),
			),
		d1
			.select({
				id: mealIngredient.id,
				mealId: mealIngredient.mealId,
				cargoId: mealIngredient.cargoId,
				ingredientName: mealIngredient.ingredientName,
				quantity: mealIngredient.quantity,
				unit: mealIngredient.unit,
				isOptional: mealIngredient.isOptional,
				orderIndex: mealIngredient.orderIndex,
			})
			.from(mealIngredient)
			.innerJoin(meal, eq(mealIngredient.mealId, meal.id))
			.where(
				and(
					eq(meal.organizationId, organizationId),
					isNull(mealIngredient.cargoId),
					sql`lower(${mealIngredient.ingredientName}) = ${normalizedName}`,
				),
			),
	]);

	const allConnections: ConnectedMealIngredient[] = [
		...directRows.map((row) => ({ ...row, connectionType: "direct" as const })),
		...nameRows.map((row) => ({
			...row,
			connectionType: "name_match" as const,
		})),
	];

	if (allConnections.length === 0) {
		return [];
	}

	const mealIds = [...new Set(allConnections.map((row) => row.mealId))];
	const [meals, tagsByMealId] = await Promise.all([
		chunkedQuery(mealIds, (chunk) =>
			d1
				.select()
				.from(meal)
				.where(
					and(eq(meal.organizationId, organizationId), inArray(meal.id, chunk)),
				),
		),
		getTagsForMealIds(db, mealIds),
	]);

	const connectionsByMealId = new Map<string, ConnectedMealIngredient[]>();
	for (const connection of allConnections) {
		const existing = connectionsByMealId.get(connection.mealId) ?? [];
		existing.push(connection);
		connectionsByMealId.set(connection.mealId, existing);
	}

	return meals
		.map((mealRecord) => ({
			...mealRecord,
			tags: tagsByMealId.get(mealRecord.id) ?? [],
			connectedIngredients: (connectionsByMealId.get(mealRecord.id) ?? []).sort(
				(a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
			),
		}))
		.sort((a, b) => {
			const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
			const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
			return bTime - aTime;
		});
}

/**
 * Creates a new meal with ingredients and tags in a single atomic operation.
 * Ingredient/tag inserts are chunked to respect D1's 100 bound-params-per-query limit.
 */
export async function createMeal(
	db: D1Database,
	organizationId: string,
	data: MealInput,
	env?: Env,
	options?: MealWriteOptions,
) {
	if (env) {
		const capacity = await checkCapacity(env, organizationId, "meals", 1);
		if (!capacity.allowed) {
			throw new Error(
				`capacity_exceeded:meals:${capacity.current}:${capacity.limit}`,
			);
		}
	}

	const d1 = drizzle(db);
	const mealId = crypto.randomUUID();

	let mealTagRows: { mealId: string; tagId: string }[] = [];
	if (data.tags.length > 0) {
		const tagIds = await resolveMealTagIds(
			db,
			organizationId,
			data.tags,
			options,
		);
		mealTagRows = tagIds.map((tagId) => ({ mealId, tagId }));
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [
		d1.insert(meal).values({
			id: mealId,
			organizationId,
			name: data.name,
			domain: data.domain,
			description: data.description,
			directions: data.directions,
			equipment: data.equipment,
			servings: data.servings,
			prepTime: data.prepTime,
			cookTime: data.cookTime,
			customFields: data.customFields || {},
		}),
	];

	if (data.ingredients.length > 0) {
		let baseIndex = 0;
		for (const ingredientChunk of chunkArray(
			data.ingredients,
			D1_MAX_INGREDIENT_ROWS_PER_STATEMENT,
		)) {
			batch.push(
				d1
					.insert(mealIngredient)
					.values(
						ingredientChunk.map((ing, i) =>
							mealIngredientValues(mealId, ing, baseIndex + i),
						),
					),
			);
			baseIndex += ingredientChunk.length;
		}
	}

	if (mealTagRows.length > 0) {
		for (const tagChunk of chunkArray(
			mealTagRows,
			D1_MAX_TAG_ROWS_PER_STATEMENT,
		)) {
			batch.push(d1.insert(mealTag).values(tagChunk));
		}
	}

	trackD1BatchSize("createMeal", batch.length, {
		organizationRef: organizationId,
	});

	await trackWriteOperation(
		"createMeal",
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		() => d1.batch(batch as [any, ...any[]]),
		{
			organizationRef: organizationId,
		},
	);

	return options?.skipReturnRead
		? null
		: await getMeal(db, organizationId, mealId);
}

/**
 * Creates multiple meals in a single atomic batch. All-or-nothing.
 * Returns the created meals with ingredients and tags.
 * When env is provided, runs capacity check, trackD1BatchSize, and trackWriteOperation.
 */
export async function createMeals(
	db: D1Database,
	organizationId: string,
	inputs: MealInput[],
	env?: Env,
) {
	if (inputs.length === 0) return [];
	if (inputs.length > MAX_BATCH_MEALS) {
		throw new Error(
			`Batch size exceeds maximum of ${MAX_BATCH_MEALS} meals per request`,
		);
	}

	if (env) {
		const capacity = await checkCapacity(
			env,
			organizationId,
			"meals",
			inputs.length,
		);
		if (!capacity.allowed) {
			throw new Error(
				`capacity_exceeded:meals:${capacity.current}:${capacity.limit}`,
			);
		}
	}

	const d1 = drizzle(db);

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [];
	const mealIds: string[] = [];

	for (const data of inputs) {
		const mealId = crypto.randomUUID();
		mealIds.push(mealId);

		batch.push(
			d1.insert(meal).values({
				id: mealId,
				organizationId,
				name: data.name,
				domain: data.domain,
				description: data.description,
				directions: data.directions,
				equipment: data.equipment,
				servings: data.servings,
				prepTime: data.prepTime,
				cookTime: data.cookTime,
				customFields: data.customFields || {},
			}),
		);

		if (data.ingredients.length > 0) {
			let baseIndex = 0;
			for (const ingredientChunk of chunkArray(
				data.ingredients,
				D1_MAX_INGREDIENT_ROWS_PER_STATEMENT,
			)) {
				batch.push(
					d1
						.insert(mealIngredient)
						.values(
							ingredientChunk.map((ing, i) =>
								mealIngredientValues(mealId, ing, baseIndex + i),
							),
						),
				);
				baseIndex += ingredientChunk.length;
			}
		}

		if (data.tags.length > 0) {
			const tagIds = await resolveTagIds(db, organizationId, data.tags);
			for (const tagChunk of chunkArray(
				tagIds.map((tagId) => ({ mealId, tagId })),
				D1_MAX_TAG_ROWS_PER_STATEMENT,
			)) {
				batch.push(d1.insert(mealTag).values(tagChunk));
			}
		}
	}

	if (env) {
		trackD1BatchSize("createMeals", batch.length, {
			organizationRef: organizationId,
		});
		await trackWriteOperation(
			"createMeals",
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
			() => d1.batch(batch as [any, ...any[]]),
			{ organizationRef: organizationId },
		);
	} else {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(batch as [any, ...any[]]);
	}

	const results = await Promise.all(
		mealIds.map((id) => getMeal(db, organizationId, id)),
	);
	return results.filter((m): m is NonNullable<typeof m> => m !== null);
}

/**
 * Updates an existing meal, its ingredients, and tags atomically.
 */
export async function updateMeal(
	db: D1Database,
	organizationId: string,
	mealId: string,
	data: MealInput,
	options?: MealWriteOptions,
) {
	const d1 = drizzle(db);

	// Verify ownership
	const [existing] = await d1
		.select()
		.from(meal)
		.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId)));

	if (!existing) throw new Error("Meal not found or unauthorized");

	let mealTagRows: { mealId: string; tagId: string }[] = [];
	if (data.tags.length > 0) {
		const tagIds = await resolveMealTagIds(
			db,
			organizationId,
			data.tags,
			options,
		);
		mealTagRows = tagIds.map((tagId) => ({ mealId, tagId }));
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [
		d1
			.update(meal)
			.set({
				name: data.name,
				domain: data.domain,
				description: data.description,
				directions: data.directions,
				equipment: data.equipment,
				servings: data.servings,
				prepTime: data.prepTime,
				cookTime: data.cookTime,
				customFields: data.customFields || {},
				updatedAt: new Date(),
			})
			.where(eq(meal.id, mealId)),
		d1.delete(mealIngredient).where(eq(mealIngredient.mealId, mealId)),
		d1.delete(mealTag).where(eq(mealTag.mealId, mealId)),
	];

	if (data.ingredients.length > 0) {
		let baseIndex = 0;
		for (const ingredientChunk of chunkArray(
			data.ingredients,
			D1_MAX_INGREDIENT_ROWS_PER_STATEMENT,
		)) {
			batch.push(
				d1
					.insert(mealIngredient)
					.values(
						ingredientChunk.map((ing, i) =>
							mealIngredientValues(mealId, ing, baseIndex + i),
						),
					),
			);
			baseIndex += ingredientChunk.length;
		}
	}

	if (mealTagRows.length > 0) {
		for (const tagChunk of chunkArray(
			mealTagRows,
			D1_MAX_TAG_ROWS_PER_STATEMENT,
		)) {
			batch.push(d1.insert(mealTag).values(tagChunk));
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(batch as [any, ...any[]]);

	return options?.skipReturnRead
		? null
		: await getMeal(db, organizationId, mealId);
}

/**
 * Creates a provision (single-item "meal" with type='provision').
 * Auto-creates exactly one meal_ingredient row. Counts toward meal capacity.
 */
export async function createProvision(
	db: D1Database,
	organizationId: string,
	data: ProvisionInput,
	env?: Env,
	options?: MealWriteOptions,
) {
	if (env) {
		const capacity = await checkCapacity(env, organizationId, "meals", 1);
		if (!capacity.allowed) {
			throw new Error(
				`capacity_exceeded:meals:${capacity.current}:${capacity.limit}`,
			);
		}
	}

	const d1 = drizzle(db);
	const mealId = crypto.randomUUID();
	const ingredientId = crypto.randomUUID();

	let mealTagRows: { mealId: string; tagId: string }[] = [];
	if (data.tags.length > 0) {
		const tagIds = await resolveMealTagIds(
			db,
			organizationId,
			data.tags,
			options,
		);
		mealTagRows = tagIds.map((tagId) => ({ mealId, tagId }));
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [
		d1.insert(meal).values({
			id: mealId,
			organizationId,
			name: data.name,
			domain: data.domain,
			type: "provision",
			servings: 1,
		}),
		d1.insert(mealIngredient).values(
			mealIngredientValues(
				mealId,
				{
					ingredientName: data.name,
					quantity: data.quantity,
					unit: data.unit,
				},
				0,
				ingredientId,
			),
		),
	];

	if (mealTagRows.length > 0) {
		for (const tagChunk of chunkArray(
			mealTagRows,
			D1_MAX_TAG_ROWS_PER_STATEMENT,
		)) {
			batch.push(d1.insert(mealTag).values(tagChunk));
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(batch as [any, ...any[]]);

	return options?.skipReturnRead
		? null
		: await getMeal(db, organizationId, mealId);
}

/**
 * Updates a provision. Only meals with type='provision' can be updated this way.
 * Updates meal name/domain and the single ingredient's name/quantity/unit; replaces tags.
 */
export async function updateProvision(
	db: D1Database,
	organizationId: string,
	mealId: string,
	data: ProvisionUpdateInput,
	options?: MealWriteOptions,
) {
	const d1 = drizzle(db);

	const [existing] = await d1
		.select()
		.from(meal)
		.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId)));

	if (!existing) throw new Error("Provision not found or unauthorized");
	if (existing.type !== "provision") {
		throw new Error("Meal is not a provision; use updateMeal instead");
	}

	const [singleIngredient] = await d1
		.select()
		.from(mealIngredient)
		.where(eq(mealIngredient.mealId, mealId))
		.orderBy(mealIngredient.orderIndex)
		.limit(1);

	if (!singleIngredient) {
		throw new Error("Provision has no ingredient row");
	}

	const mealUpdates: Partial<typeof meal.$inferInsert> = {
		updatedAt: new Date(),
	};
	if (data.name !== undefined) mealUpdates.name = data.name;
	if (data.domain !== undefined) mealUpdates.domain = data.domain;

	const ingUpdates: Partial<typeof mealIngredient.$inferInsert> = {};
	if (data.name !== undefined) ingUpdates.ingredientName = data.name;
	if (data.quantity !== undefined) ingUpdates.quantity = data.quantity;
	if (data.unit !== undefined) ingUpdates.unit = data.unit;

	let mealTagRows: { mealId: string; tagId: string }[] = [];
	if (data.tags !== undefined && data.tags.length > 0) {
		const tagIds = await resolveMealTagIds(
			db,
			organizationId,
			data.tags,
			options,
		);
		mealTagRows = tagIds.map((tagId) => ({ mealId, tagId }));
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [
		d1.update(meal).set(mealUpdates).where(eq(meal.id, mealId)),
		d1
			.update(mealIngredient)
			.set(ingUpdates)
			.where(eq(mealIngredient.id, singleIngredient.id)),
	];

	if (data.tags !== undefined) {
		batch.push(d1.delete(mealTag).where(eq(mealTag.mealId, mealId)));
		if (mealTagRows.length > 0) {
			for (const tagChunk of chunkArray(
				mealTagRows,
				D1_MAX_TAG_ROWS_PER_STATEMENT,
			)) {
				batch.push(d1.insert(mealTag).values(tagChunk));
			}
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(batch as [any, ...any[]]);

	return options?.skipReturnRead
		? null
		: await getMeal(db, organizationId, mealId);
}

/**
 * Deletes a meal. Verification ensures organization can only delete their own meals.
 */
export async function deleteMeal(
	db: D1Database,
	organizationId: string,
	mealId: string,
) {
	const d1 = drizzle(db);
	return await d1
		.delete(meal)
		.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId)));
}

/**
 * Finds cargo rows to deduct from when ingredient has no cargoId.
 * Uses exact normalizeForCargoDedup match first, then the pre-fetched
 * vector similarity map as fallback. Callers must pre-fetch
 * `prefetchedVectors` via findSimilarCargoBatch before the deduction loop.
 * Returns allocations in cargo's native unit for SQL update.
 */
export function findCargoForDeduction(
	orgCargo: CargoIndexRow[],
	ingredientName: string,
	requiredQtyInTargetUnit: number,
	targetUnit: SupportedUnit,
	prefetchedVectors: Map<string, SimilarCargoMatch[]>,
	allowPartial = false,
): CargoDeductionPlan {
	const normalizedName = normalizeForCargoDedup(ingredientName);
	type Candidate = {
		cargo: CargoIndexRow;
		qtyInTargetUnit: number;
		isExact: boolean;
		score: number;
	};
	const candidates: Candidate[] = [];

	// Exact name match candidates — use canonical conversion so cross-family
	// (e.g. cargo in grams, recipe in cups) is resolved via ingredient density.
	for (const item of orgCargo) {
		const normalizedItem = normalizeForCargoDedup(item.name);
		if (normalizedItem !== normalizedName) continue;
		if (!isCargoUsableForMatching(item.expiresAt)) continue;

		const base = effectiveBaseFields(
			item.quantity,
			item.unit,
			item.baseQuantity ?? item.quantity,
			item.baseUnit ?? item.unit,
			ingredientName,
		);
		const qtyInTargetUnit = convertIngredientAmount(
			base.baseQuantity,
			toSupportedUnit(base.baseUnit),
			targetUnit,
			ingredientName,
		);
		if (qtyInTargetUnit === null) continue;

		candidates.push({
			cargo: item,
			qtyInTargetUnit,
			isExact: true,
			score: 1,
		});
	}

	// Semantic fallback candidates when no exact match found.
	if (candidates.length === 0) {
		const similar = prefetchedVectors.get(ingredientName) ?? [];
		for (const match of similar) {
			const item = orgCargo.find((c) => c.id === match.itemId);
			if (!item) continue;
			if (!isCargoUsableForMatching(item.expiresAt)) continue;
			const base = effectiveBaseFields(
				item.quantity,
				item.unit,
				item.baseQuantity ?? item.quantity,
				item.baseUnit ?? item.unit,
				ingredientName,
			);
			const qtyInTargetUnit = convertIngredientAmount(
				base.baseQuantity,
				toSupportedUnit(base.baseUnit),
				targetUnit,
				ingredientName,
			);
			if (qtyInTargetUnit === null) continue;
			candidates.push({
				cargo: item,
				qtyInTargetUnit,
				isExact: false,
				score: match.score,
			});
		}
	}

	candidates.sort((a, b) => {
		if (a.isExact !== b.isExact) return a.isExact ? -1 : 1;
		if (a.score !== b.score) return b.score - a.score;
		return b.qtyInTargetUnit - a.qtyInTargetUnit;
	});

	let remaining = requiredQtyInTargetUnit;
	const allocations: { cargoId: string; quantityToDeduct: number }[] = [];

	for (const {
		cargo: item,
		qtyInTargetUnit: availableInTarget,
	} of candidates) {
		if (remaining <= 0) break;

		const itemUnit = toSupportedUnit(item.unit) as SupportedUnit;
		const toDeductInTarget = Math.min(remaining, availableInTarget);
		remaining -= toDeductInTarget;

		// Convert the amount to deduct back into the cargo's native unit using the
		// same canonical conversion to guarantee symmetric round-trip math.
		const toDeductInCargoUnit = convertIngredientAmount(
			toDeductInTarget,
			targetUnit,
			itemUnit,
			ingredientName,
		);
		if (toDeductInCargoUnit === null) {
			// Should not happen if forward conversion succeeded; skip defensively.
			remaining += toDeductInTarget;
			continue;
		}
		allocations.push({
			cargoId: item.id,
			quantityToDeduct: toDeductInCargoUnit,
		});
	}

	return {
		allocations: remaining <= 0 || allowPartial ? allocations : [],
		shortfallInTargetUnit: remaining,
	};
}

/**
 * Executes a meal cooking procedure.
 *
 * Safety Features:
 * 1. Ownership Verification: Ensures the meal belongs to the organization.
 * 2. Inventory Check: Verifies all linked inventory items have sufficient quantity.
 * 3. Name-based fallback: When cargoId is null, matches cargo by name (same logic as supply).
 * 4. Race Condition Prevention: Uses a batch operation for deduction.
 * 5. Input Validation: Prevents SQL injection via type-safe Drizzle parameters.
 *
 * Servings resolution order:
 *   options.servings → activeMealSelection.servingsOverride → meal.servings
 */
export async function cookMeal(
	env: Env,
	organizationId: string,
	mealId: string,
	options?: { servings?: number; deductionMode?: CookMealDeductionMode },
) {
	const allowPartial = options?.deductionMode === "partial";
	const d1 = drizzle(env.DB);

	// 1+2+3 in a single D1 batch round-trip: meal record, ingredients, and
	// active-selection override are all fetched simultaneously.
	const [mealResults, ingredients, selectionResults] = await d1.batch([
		d1
			.select()
			.from(meal)
			.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId))),
		d1
			.select()
			.from(mealIngredient)
			.where(eq(mealIngredient.mealId, mealId))
			.orderBy(mealIngredient.orderIndex),
		d1
			.select({ servingsOverride: activeMealSelection.servingsOverride })
			.from(activeMealSelection)
			.where(
				and(
					eq(activeMealSelection.organizationId, organizationId),
					eq(activeMealSelection.mealId, mealId),
				),
			),
	]);

	const mealRecord = mealResults[0];
	if (!mealRecord) {
		throw new Error("Meal not found or unauthorized for this organization.");
	}

	// Resolve effective servings: explicit option → selection override → base
	let effectiveServings = mealRecord.servings ?? 1;
	if (options?.servings != null) {
		effectiveServings = options.servings;
	} else {
		const selection = selectionResults[0];
		if (selection?.servingsOverride != null) {
			effectiveServings = selection.servingsOverride;
		}
	}

	const scaleFactor = getScaleFactor(
		mealRecord.servings ?? 1,
		effectiveServings,
	);

	const linkedIngredients = ingredients.filter(
		(ing) => ing.cargoId && typeof ing.cargoId === "string",
	);
	const unlinkedIngredients = ingredients.filter(
		(ing) => !ing.cargoId || typeof ing.cargoId !== "string",
	);

	// 4. Build deduction updates: linked (by cargoId) and unlinked (by name match)
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	const updates: any[] = [];
	const deductions: CargoDeduction[] = [];
	const skippedIngredients: MissingIngredientDetail[] = [];
	let cargoById = new Map<string, typeof cargo.$inferSelect>();

	if (linkedIngredients.length > 0) {
		const cargoIds = linkedIngredients.map((ing) => ing.cargoId as string);
		const currentCargo = await chunkedQuery(
			cargoIds,
			(chunk) =>
				d1
					.select()
					.from(cargo)
					.where(
						and(
							eq(cargo.organizationId, organizationId),
							inArray(cargo.id, chunk),
						),
					),
			D1_MAX_BOUND_PARAMS - 1,
		);

		cargoById = new Map(currentCargo.map((i) => [i.id, i]));

		if (!allowPartial) {
			const insufficient = linkedIngredients.filter((ing) => {
				if (ing.isOptional) return false;
				const c = cargoById.get(ing.cargoId as string);
				if (!c) return true;
				if (!isCargoUsableForMatching(c.expiresAt)) return true;
				const ingUnit = toSupportedUnit(ing.unit);
				const cargoUnit = toSupportedUnit(c.unit);
				const scaledQty = scaleQuantity(ing.quantity, scaleFactor, ing.unit);
				const deductionInCargoUnit = convertIngredientAmount(
					scaledQty,
					ingUnit,
					cargoUnit,
					ing.ingredientName,
				);
				if (deductionInCargoUnit === null) return true;
				return c.quantity < deductionInCargoUnit;
			});

			if (insufficient.length > 0) {
				const names = insufficient.map((i) => i.ingredientName).join(", ");
				throw new Error(`Insufficient Cargo for: ${names}`);
			}
		}

		for (const ing of linkedIngredients) {
			const c = cargoById.get(ing.cargoId as string);
			const scaledQty = scaleQuantity(ing.quantity, scaleFactor, ing.unit);
			if (!c) {
				if (ing.isOptional) continue;
				if (allowPartial) {
					skippedIngredients.push({
						name: ing.ingredientName,
						required: scaledQty,
						available: 0,
						unit: ing.unit,
					});
					continue;
				}
				throw new Error(`Cargo not found for ingredient ${ing.ingredientName}`);
			}
			if (!isCargoUsableForMatching(c.expiresAt)) {
				if (ing.isOptional) continue;
				if (allowPartial) {
					skippedIngredients.push({
						name: ing.ingredientName,
						required: scaledQty,
						available: 0,
						unit: ing.unit,
					});
					continue;
				}
				throw new Error(`Insufficient Cargo for: ${ing.ingredientName}`);
			}
			const ingUnit = toSupportedUnit(ing.unit);
			const cargoUnit = toSupportedUnit(c.unit);
			const deductionInCargoUnit = convertIngredientAmount(
				scaledQty,
				ingUnit,
				cargoUnit,
				ing.ingredientName,
			);
			if (deductionInCargoUnit === null) {
				if (ing.isOptional) continue;
				if (allowPartial) {
					skippedIngredients.push({
						name: ing.ingredientName,
						required: scaledQty,
						available: 0,
						unit: ing.unit,
					});
					continue;
				}
				throw new Error(
					`Cannot convert ${ing.unit} to ${c.unit} for ${ing.ingredientName}`,
				);
			}
			const actualDeductionInCargoUnit = allowPartial
				? Math.min(c.quantity, deductionInCargoUnit)
				: deductionInCargoUnit;
			if (!allowPartial && c.quantity < deductionInCargoUnit) {
				if (ing.isOptional) continue;
				throw new Error(`Insufficient Cargo for: ${ing.ingredientName}`);
			}
			if (allowPartial && actualDeductionInCargoUnit <= 0) {
				if (ing.isOptional) continue;
				const availableInIngUnit =
					convertIngredientAmount(
						c.quantity,
						cargoUnit,
						ingUnit,
						ing.ingredientName,
					) ?? 0;
				skippedIngredients.push({
					name: ing.ingredientName,
					required: scaledQty,
					available: availableInIngUnit,
					unit: ing.unit,
				});
				continue;
			}
			if (
				allowPartial &&
				actualDeductionInCargoUnit < deductionInCargoUnit &&
				!ing.isOptional
			) {
				const availableInIngUnit =
					convertIngredientAmount(
						c.quantity,
						cargoUnit,
						ingUnit,
						ing.ingredientName,
					) ?? 0;
				skippedIngredients.push({
					name: ing.ingredientName,
					required: scaledQty,
					available: availableInIngUnit,
					unit: ing.unit,
				});
			}
			recordCargoDeduction(
				deductions,
				ing.cargoId as string,
				actualDeductionInCargoUnit,
			);
			updates.push(
				d1
					.update(cargo)
					.set({
						quantity: sql`${cargo.quantity} - ${actualDeductionInCargoUnit}`,
					})
					.where(
						and(
							eq(cargo.id, ing.cargoId as string),
							eq(cargo.organizationId, organizationId),
						),
					),
			);
		}
	}

	// 5. Name-based deduction for unlinked ingredients
	if (unlinkedIngredients.length > 0) {
		let orgCargo: CargoIndexRow[] = await fetchOrgCargoIndex(
			env.DB,
			organizationId,
		);

		// Adjust effective quantities for linked deductions (same cargo row may be used by both)
		if (linkedIngredients.length > 0 && deductions.length > 0) {
			const linkedDeductions = new Map<string, number>();
			for (const d of deductions) {
				linkedDeductions.set(
					d.cargoId,
					(linkedDeductions.get(d.cargoId) ?? 0) + d.quantity,
				);
			}
			orgCargo = orgCargo.map((item) => ({
				...item,
				quantity: item.quantity - (linkedDeductions.get(item.id) ?? 0),
			}));
		}

		// Pre-fetch vector similarity for all unlinked ingredient names in a single
		// batched embedding request instead of N sequential Vectorize calls.
		const unlinkedNames = unlinkedIngredients.map((i) => i.ingredientName);
		const prefetchedVectors = await findSimilarCargoBatch(
			env,
			organizationId,
			unlinkedNames,
			{ topK: 3, threshold: SIMILARITY_THRESHOLDS.CARGO_DEDUCTION },
		);

		const insufficient: string[] = [];

		for (const ing of unlinkedIngredients) {
			const targetUnit = toSupportedUnit(ing.unit) as SupportedUnit;
			const scaledQty = scaleQuantity(ing.quantity, scaleFactor, ing.unit);
			if (scaledQty <= 0) continue;

			const { allocations, shortfallInTargetUnit } = findCargoForDeduction(
				orgCargo,
				ing.ingredientName,
				scaledQty,
				targetUnit,
				prefetchedVectors,
				allowPartial,
			);

			if (allocations.length === 0) {
				if (!ing.isOptional) {
					if (allowPartial) {
						skippedIngredients.push({
							name: ing.ingredientName,
							required: scaledQty,
							available: 0,
							unit: ing.unit,
						});
					} else {
						insufficient.push(ing.ingredientName);
					}
				}
				continue;
			}

			if (allowPartial && shortfallInTargetUnit > 0 && !ing.isOptional) {
				skippedIngredients.push({
					name: ing.ingredientName,
					required: scaledQty,
					available: scaledQty - shortfallInTargetUnit,
					unit: ing.unit,
				});
			}

			for (const { cargoId, quantityToDeduct } of allocations) {
				recordCargoDeduction(deductions, cargoId, quantityToDeduct);
				updates.push(
					d1
						.update(cargo)
						.set({
							quantity: sql`${cargo.quantity} - ${quantityToDeduct}`,
						})
						.where(
							and(
								eq(cargo.id, cargoId),
								eq(cargo.organizationId, organizationId),
							),
						),
				);
			}
		}

		if (insufficient.length > 0) {
			throw new Error(`Insufficient Cargo for: ${insufficient.join(", ")}`);
		}
	}

	if (updates.length > 0) {
		trackD1BatchSize("cookMeal", updates.length, {
			organizationRef: organizationId,
		});
		await trackWriteOperation(
			"cookMeal",
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
			() => d1.batch(updates as [any, ...any[]]),
			{
				organizationRef: organizationId,
			},
		);
	}

	return {
		cooked: true,
		ingredientsDeducted: updates.length,
		servings: effectiveServings,
		deductions,
		partialCook: skippedIngredients.length > 0,
		skippedIngredients:
			skippedIngredients.length > 0 ? skippedIngredients : undefined,
	};
}

/**
 * Creates a provision from an existing cargo item, linking via cargoId.
 * Prevents duplicates: if a provision already has an ingredient pointing to
 * this cargo item, returns the existing provision with alreadyExisted=true.
 */
export async function createProvisionFromCargo(
	db: D1Database,
	organizationId: string,
	cargoId: string,
	env?: Env,
): Promise<{
	provision: Awaited<ReturnType<typeof getMeal>>;
	alreadyExisted: boolean;
}> {
	const d1 = drizzle(db);

	// Load cargo with RLS
	const [cargoItem] = await d1
		.select()
		.from(cargo)
		.where(
			and(eq(cargo.id, cargoId), eq(cargo.organizationId, organizationId)),
		);

	if (!cargoItem) {
		throw new Error("Cargo item not found or unauthorized");
	}

	// Duplicate check: find an existing provision whose ingredient links to this cargo
	const existingByCargoId = await d1
		.select({ mealId: mealIngredient.mealId })
		.from(mealIngredient)
		.innerJoin(meal, eq(mealIngredient.mealId, meal.id))
		.where(
			and(
				eq(mealIngredient.cargoId, cargoId),
				eq(meal.organizationId, organizationId),
				eq(meal.type, "provision"),
			),
		)
		.limit(1);

	if (existingByCargoId.length > 0) {
		const existing = await getMeal(
			db,
			organizationId,
			existingByCargoId[0].mealId,
		);
		return { provision: existing, alreadyExisted: true };
	}

	// Capacity check
	if (env) {
		const capacity = await checkCapacity(env, organizationId, "meals", 1);
		if (!capacity.allowed) {
			throw new Error(
				`capacity_exceeded:meals:${capacity.current}:${capacity.limit}`,
			);
		}
	}

	const mealId = crypto.randomUUID();
	const ingredientId = crypto.randomUUID();
	const cargoTagsMap = await getTagsForCargoIds(db, [cargoId]);
	const tagSlugs = tagsToSlugs(cargoTagsMap.get(cargoId) ?? []);

	let mealTagRows: { mealId: string; tagId: string }[] = [];
	if (tagSlugs.length > 0) {
		const tagIds = await resolveTagIds(db, organizationId, tagSlugs);
		mealTagRows = tagIds.map((tagId) => ({ mealId, tagId }));
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [
		d1.insert(meal).values({
			id: mealId,
			organizationId,
			name: cargoItem.name,
			domain: cargoItem.domain,
			type: "provision",
			servings: 1,
		}),
		d1.insert(mealIngredient).values(
			mealIngredientValues(
				mealId,
				{
					cargoId,
					ingredientName: cargoItem.name,
					quantity: cargoItem.quantity,
					unit: cargoItem.unit,
				},
				0,
				ingredientId,
			),
		),
	];

	if (mealTagRows.length > 0) {
		for (const tagChunk of chunkArray(
			mealTagRows,
			D1_MAX_TAG_ROWS_PER_STATEMENT,
		)) {
			batch.push(d1.insert(mealTag).values(tagChunk));
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(batch as [any, ...any[]]);

	const provision = await getMeal(db, organizationId, mealId);
	return { provision, alreadyExisted: false };
}

/**
 * Returns cargo IDs that already have a linked provision in this org.
 * Used to show "In Galley" indicator on cargo cards.
 */
export async function getPromotedCargoIds(
	db: D1Database,
	organizationId: string,
): Promise<string[]> {
	const d1 = drizzle(db);

	const rows = await d1
		.select({ cargoId: mealIngredient.cargoId })
		.from(mealIngredient)
		.innerJoin(meal, eq(mealIngredient.mealId, meal.id))
		.where(
			and(eq(meal.organizationId, organizationId), eq(meal.type, "provision")),
		);

	return rows.map((r) => r.cargoId).filter((id): id is string => id !== null);
}

/**
 * Retrieves all unique tag slugs for an organization.
 * Useful for populating tag filter dropdowns.
 */
export const getOrganizationMealTags = getOrganizationTagSlugs;

/** Alias for org tag slug list (autocomplete). */
export const getMealTags = getOrganizationTagSlugs;
