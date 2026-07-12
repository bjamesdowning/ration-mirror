import { and, count, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { cargo, cargoTag, meal, mealTag, tag } from "../db/schema";
import {
	chunkArray,
	chunkedQuery,
	D1_MAX_TAG_INSERT_ROWS_PER_STATEMENT,
	D1_MAX_TAG_ROWS_PER_STATEMENT,
} from "./query-utils.server";
import { resolveTagSlugFromName } from "./slugify";
import {
	dedupeTagSlugs,
	formatTagName,
	MAX_TAG_SLUG_LENGTH,
	sanitizeTagColor,
	type TagRecord,
	type TagWithCounts,
} from "./tags";

export type { TagRecord, TagWithCounts };

function toTagRecord(row: typeof tag.$inferSelect): TagRecord {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		color: sanitizeTagColor(row.color),
		category: row.category,
	};
}

export async function getOrganizationTags(
	db: D1Database,
	organizationId: string,
): Promise<TagWithCounts[]> {
	const d1 = drizzle(db);

	const tags = await d1
		.select()
		.from(tag)
		.where(eq(tag.organizationId, organizationId))
		.orderBy(tag.name);

	if (tags.length === 0) return [];

	const tagIds = tags.map((t) => t.id);

	const [cargoCounts, mealCounts] = await Promise.all([
		chunkedQuery(tagIds, async (chunk) =>
			d1
				.select({
					tagId: cargoTag.tagId,
					cnt: count(),
				})
				.from(cargoTag)
				.innerJoin(cargo, eq(cargoTag.cargoId, cargo.id))
				.where(
					and(
						eq(cargo.organizationId, organizationId),
						inArray(cargoTag.tagId, chunk),
					),
				)
				.groupBy(cargoTag.tagId),
		),
		chunkedQuery(tagIds, async (chunk) =>
			d1
				.select({
					tagId: mealTag.tagId,
					cnt: count(),
				})
				.from(mealTag)
				.innerJoin(meal, eq(mealTag.mealId, meal.id))
				.where(
					and(
						eq(meal.organizationId, organizationId),
						inArray(mealTag.tagId, chunk),
					),
				)
				.groupBy(mealTag.tagId),
		),
	]);

	const cargoByTag = new Map(cargoCounts.map((r) => [r.tagId, r.cnt]));
	const mealByTag = new Map(mealCounts.map((r) => [r.tagId, r.cnt]));

	return tags.map((t) => ({
		...toTagRecord(t),
		cargoCount: cargoByTag.get(t.id) ?? 0,
		mealCount: mealByTag.get(t.id) ?? 0,
	}));
}

export async function getTagBySlug(
	db: D1Database,
	organizationId: string,
	slug: string,
): Promise<TagRecord | null> {
	const d1 = drizzle(db);
	const rows = await d1
		.select()
		.from(tag)
		.where(and(eq(tag.organizationId, organizationId), eq(tag.slug, slug)))
		.limit(1);
	return rows[0] ? toTagRecord(rows[0]) : null;
}

export async function getTagById(
	db: D1Database,
	organizationId: string,
	tagId: string,
): Promise<TagRecord | null> {
	const d1 = drizzle(db);
	const rows = await d1
		.select()
		.from(tag)
		.where(and(eq(tag.organizationId, organizationId), eq(tag.id, tagId)))
		.limit(1);
	return rows[0] ? toTagRecord(rows[0]) : null;
}

export async function createTag(
	db: D1Database,
	organizationId: string,
	input: {
		slug?: string;
		name?: string;
		color?: string | null;
		category?: string | null;
	},
	userId?: string | null,
): Promise<TagRecord> {
	const d1 = drizzle(db);

	let slug = input.slug;
	if (!slug) {
		const displayName = input.name?.trim();
		if (!displayName) {
			throw new Error("tag_name_required");
		}
		slug = await resolveTagSlugFromName(
			displayName,
			MAX_TAG_SLUG_LENGTH,
			async (candidate) =>
				Boolean(await getTagBySlug(db, organizationId, candidate)),
		);
	}

	const existing = await getTagBySlug(db, organizationId, slug);
	if (existing) return existing;

	const id = crypto.randomUUID();
	const name = input.name?.trim() || formatTagName(slug);
	const color = sanitizeTagColor(input.color ?? null);
	const category = input.category?.trim() || null;

	await d1
		.insert(tag)
		.values({
			id,
			organizationId,
			slug,
			name,
			color,
			category,
			createdBy: userId ?? null,
		})
		.onConflictDoNothing();

	const created = await getTagBySlug(db, organizationId, slug);
	if (!created) {
		throw new Error("tag_create_failed");
	}
	return created;
}

/** Create missing tags; return IDs in slug order. */
export async function resolveTagIds(
	db: D1Database,
	organizationId: string,
	slugs: string[],
	userId?: string | null,
): Promise<string[]> {
	const normalized = dedupeTagSlugs(slugs);
	if (normalized.length === 0) return [];

	const d1 = drizzle(db);
	const existingRows = await d1
		.select({ id: tag.id, slug: tag.slug })
		.from(tag)
		.where(
			and(
				eq(tag.organizationId, organizationId),
				inArray(tag.slug, normalized),
			),
		);

	const bySlug = new Map(existingRows.map((row) => [row.slug, row.id]));

	const missing = normalized.filter((slug) => !bySlug.has(slug));
	if (missing.length > 0) {
		const insertRows = missing.map((slug) => ({
			id: crypto.randomUUID(),
			organizationId,
			slug,
			name: formatTagName(slug),
			color: null as string | null,
			category: null as string | null,
			createdBy: userId ?? null,
		}));

		const insertStmts = chunkArray(
			insertRows,
			D1_MAX_TAG_INSERT_ROWS_PER_STATEMENT,
		).map((chunk) => d1.insert(tag).values(chunk).onConflictDoNothing());

		if (insertStmts.length > 0) {
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
			await d1.batch(insertStmts as [any, ...any[]]);
		}

		const resolvedRows = await chunkedQuery(missing, (chunk) =>
			d1
				.select({ id: tag.id, slug: tag.slug })
				.from(tag)
				.where(
					and(eq(tag.organizationId, organizationId), inArray(tag.slug, chunk)),
				),
		);

		for (const row of resolvedRows) {
			bySlug.set(row.slug, row.id);
		}

		for (const slug of missing) {
			if (!bySlug.has(slug)) {
				throw new Error("tag_create_failed");
			}
		}
	}

	return normalized.map((slug) => bySlug.get(slug) as string);
}

export async function updateTag(
	db: D1Database,
	organizationId: string,
	tagId: string,
	input: {
		name?: string;
		color?: string | null;
		category?: string | null;
		slug?: string;
	},
): Promise<TagRecord | null> {
	const d1 = drizzle(db);
	const existing = await getTagById(db, organizationId, tagId);
	if (!existing) return null;

	const updates: Partial<typeof tag.$inferInsert> = {};
	if (input.name !== undefined) updates.name = input.name.trim();
	if (input.color !== undefined) updates.color = sanitizeTagColor(input.color);
	if (input.category !== undefined) updates.category = input.category;
	if (input.slug !== undefined) {
		const slug = input.slug;
		if (slug !== existing.slug) {
			const conflict = await getTagBySlug(db, organizationId, slug);
			if (conflict && conflict.id !== tagId) {
				throw new Error("tag_slug_conflict");
			}
			updates.slug = slug;
		}
	}

	if (Object.keys(updates).length > 0) {
		await d1
			.update(tag)
			.set(updates)
			.where(and(eq(tag.id, tagId), eq(tag.organizationId, organizationId)));
	}

	return (await getTagById(db, organizationId, tagId)) ?? null;
}

export async function deleteTag(
	db: D1Database,
	organizationId: string,
	tagId: string,
): Promise<boolean> {
	const d1 = drizzle(db);
	const result = await d1
		.delete(tag)
		.where(and(eq(tag.id, tagId), eq(tag.organizationId, organizationId)));
	return (result.meta?.changes ?? 0) > 0;
}

export async function mergeTags(
	db: D1Database,
	organizationId: string,
	sourceId: string,
	targetId: string,
): Promise<TagRecord | null> {
	if (sourceId === targetId) {
		return getTagById(db, organizationId, targetId);
	}

	const d1 = drizzle(db);
	const [source, target] = await Promise.all([
		getTagById(db, organizationId, sourceId),
		getTagById(db, organizationId, targetId),
	]);
	if (!source || !target) return null;

	// Repoint junction rows to target, then delete source tag (cascades old links).
	const sourceCargo = await d1
		.select({ cargoId: cargoTag.cargoId })
		.from(cargoTag)
		.where(eq(cargoTag.tagId, sourceId));

	const sourceMeals = await d1
		.select({ mealId: mealTag.mealId })
		.from(mealTag)
		.where(eq(mealTag.tagId, sourceId));

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	const repointOps: any[] = [
		...sourceCargo.map((row) =>
			d1
				.insert(cargoTag)
				.values({ cargoId: row.cargoId, tagId: targetId })
				.onConflictDoNothing(),
		),
		...sourceMeals.map((row) =>
			d1
				.insert(mealTag)
				.values({ mealId: row.mealId, tagId: targetId })
				.onConflictDoNothing(),
		),
	];

	for (const chunk of chunkArray(repointOps, 50)) {
		if (chunk.length > 0) {
			await d1.batch(chunk as [(typeof chunk)[0], ...typeof chunk]);
		}
	}

	await deleteTag(db, organizationId, sourceId);
	return getTagById(db, organizationId, targetId);
}

export async function getTagsForCargoIds(
	db: D1Database,
	cargoIds: string[],
): Promise<Map<string, TagRecord[]>> {
	if (cargoIds.length === 0) return new Map();

	const d1 = drizzle(db);
	const rows = await chunkedQuery(cargoIds, (chunk) =>
		d1
			.select({
				cargoId: cargoTag.cargoId,
				tagRow: tag,
			})
			.from(cargoTag)
			.innerJoin(cargo, eq(cargoTag.cargoId, cargo.id))
			.innerJoin(
				tag,
				and(
					eq(cargoTag.tagId, tag.id),
					eq(tag.organizationId, cargo.organizationId),
				),
			)
			.where(inArray(cargoTag.cargoId, chunk)),
	);

	const map = new Map<string, TagRecord[]>();
	for (const row of rows) {
		const list = map.get(row.cargoId) ?? [];
		list.push(toTagRecord(row.tagRow));
		map.set(row.cargoId, list);
	}
	for (const list of map.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name));
	}
	return map;
}

export async function getTagsForMealIds(
	db: D1Database,
	mealIds: string[],
): Promise<Map<string, TagRecord[]>> {
	if (mealIds.length === 0) return new Map();

	const d1 = drizzle(db);
	const rows = await chunkedQuery(mealIds, (chunk) =>
		d1
			.select({
				mealId: mealTag.mealId,
				tagRow: tag,
			})
			.from(mealTag)
			.innerJoin(meal, eq(mealTag.mealId, meal.id))
			.innerJoin(
				tag,
				and(
					eq(mealTag.tagId, tag.id),
					eq(tag.organizationId, meal.organizationId),
				),
			)
			.where(inArray(mealTag.mealId, chunk)),
	);

	const map = new Map<string, TagRecord[]>();
	for (const row of rows) {
		const list = map.get(row.mealId) ?? [];
		list.push(toTagRecord(row.tagRow));
		map.set(row.mealId, list);
	}
	for (const list of map.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name));
	}
	return map;
}

export async function setCargoTags(
	db: D1Database,
	organizationId: string,
	cargoId: string,
	slugs: string[],
	userId?: string | null,
): Promise<TagRecord[]> {
	const d1 = drizzle(db);
	const tagIds = await resolveTagIds(db, organizationId, slugs, userId);

	await d1.delete(cargoTag).where(eq(cargoTag.cargoId, cargoId));

	if (tagIds.length > 0) {
		const rows = tagIds.map((tagId) => ({ cargoId, tagId }));
		for (const chunk of chunkArray(rows, D1_MAX_TAG_ROWS_PER_STATEMENT)) {
			await d1.insert(cargoTag).values(chunk);
		}
	}

	const map = await getTagsForCargoIds(db, [cargoId]);
	return map.get(cargoId) ?? [];
}

export async function setMealTags(
	db: D1Database,
	organizationId: string,
	mealId: string,
	slugs: string[],
	userId?: string | null,
): Promise<TagRecord[]> {
	const d1 = drizzle(db);
	const tagIds = await resolveTagIds(db, organizationId, slugs, userId);

	await d1.delete(mealTag).where(eq(mealTag.mealId, mealId));

	if (tagIds.length > 0) {
		const rows = tagIds.map((tagId) => ({ mealId, tagId }));
		for (const chunk of chunkArray(rows, D1_MAX_TAG_ROWS_PER_STATEMENT)) {
			await d1.insert(mealTag).values(chunk);
		}
	}

	const map = await getTagsForMealIds(db, [mealId]);
	return map.get(mealId) ?? [];
}

/** Slugs for org tag list (autocomplete). */
export async function getOrganizationTagSlugs(
	db: D1Database,
	organizationId: string,
): Promise<string[]> {
	const d1 = drizzle(db);
	const rows = await d1
		.select({ slug: tag.slug })
		.from(tag)
		.where(eq(tag.organizationId, organizationId))
		.orderBy(tag.slug);
	return rows.map((r) => r.slug);
}

export type TagFilterMode = "or" | "and";

/** Pure helper for combining entity ID sets by tag filter mode. */
export function mergeEntityIdsForTagFilter(
	sets: readonly (readonly string[])[],
	mode: TagFilterMode,
): string[] {
	if (sets.length === 0) return [];
	if (mode === "or") {
		return [...new Set(sets.flat())];
	}
	const [first, ...rest] = sets;
	let intersection = new Set(first);
	for (const set of rest) {
		const next = new Set(set);
		intersection = new Set([...intersection].filter((id) => next.has(id)));
		if (intersection.size === 0) break;
	}
	return [...intersection];
}

/** Filter meal IDs by tag slugs (OR or AND mode). */
export async function filterMealIdsByTagSlugs(
	db: D1Database,
	organizationId: string,
	slugs: string[],
	mode: TagFilterMode = "or",
): Promise<string[]> {
	const normalized = dedupeTagSlugs(slugs);
	if (normalized.length === 0) return [];

	const d1 = drizzle(db);

	if (mode === "and" && normalized.length > 1) {
		const rows = await d1
			.select({ mealId: mealTag.mealId })
			.from(mealTag)
			.innerJoin(tag, eq(mealTag.tagId, tag.id))
			.innerJoin(meal, eq(mealTag.mealId, meal.id))
			.where(
				and(
					eq(meal.organizationId, organizationId),
					inArray(tag.slug, normalized),
				),
			)
			.groupBy(mealTag.mealId)
			.having(sql`count(distinct ${tag.slug}) = ${normalized.length}`);

		return rows.map((r) => r.mealId);
	}

	const rows = await d1
		.selectDistinct({ mealId: mealTag.mealId })
		.from(mealTag)
		.innerJoin(tag, eq(mealTag.tagId, tag.id))
		.innerJoin(meal, eq(mealTag.mealId, meal.id))
		.where(
			and(
				eq(meal.organizationId, organizationId),
				inArray(tag.slug, normalized),
			),
		);

	return rows.map((r) => r.mealId);
}

/** Filter cargo IDs by tag slugs (OR or AND mode). */
export async function filterCargoIdsByTagSlugs(
	db: D1Database,
	organizationId: string,
	slugs: string[],
	mode: TagFilterMode = "or",
): Promise<string[]> {
	const normalized = dedupeTagSlugs(slugs);
	if (normalized.length === 0) return [];

	const d1 = drizzle(db);

	if (mode === "and" && normalized.length > 1) {
		const rows = await d1
			.select({ cargoId: cargoTag.cargoId })
			.from(cargoTag)
			.innerJoin(tag, eq(cargoTag.tagId, tag.id))
			.innerJoin(cargo, eq(cargoTag.cargoId, cargo.id))
			.where(
				and(
					eq(cargo.organizationId, organizationId),
					inArray(tag.slug, normalized),
				),
			)
			.groupBy(cargoTag.cargoId)
			.having(sql`count(distinct ${tag.slug}) = ${normalized.length}`);

		return rows.map((r) => r.cargoId);
	}

	const rows = await d1
		.selectDistinct({ cargoId: cargoTag.cargoId })
		.from(cargoTag)
		.innerJoin(tag, eq(cargoTag.tagId, tag.id))
		.innerJoin(cargo, eq(cargoTag.cargoId, cargo.id))
		.where(
			and(
				eq(cargo.organizationId, organizationId),
				inArray(tag.slug, normalized),
			),
		);

	return rows.map((r) => r.cargoId);
}

/** Cargo tag index for supply cross-reference. */
export async function getCargoTagIndex(
	db: D1Database,
	organizationId: string,
): Promise<{ id: string; name: string; tags: TagRecord[] }[]> {
	const d1 = drizzle(db);
	const items = await d1
		.select({ id: cargo.id, name: cargo.name })
		.from(cargo)
		.where(eq(cargo.organizationId, organizationId));

	if (items.length === 0) return [];

	const tagMap = await getTagsForCargoIds(
		db,
		items.map((i) => i.id),
	);

	return items.map((item) => ({
		id: item.id,
		name: item.name,
		tags: tagMap.get(item.id) ?? [],
	}));
}

/** Attach TagRecord[] to entities; legacy slug helper for filters expecting strings. */
export function tagsToSlugs(tags: TagRecord[]): string[] {
	return tags.map((t) => t.slug);
}

export async function resolveSupplyItemTags(
	db: D1Database,
	organizationId: string,
	itemName: string,
	sourceMealId?: string | null,
	now: Date = new Date(),
): Promise<TagRecord[]> {
	const d1 = drizzle(db);
	const normalized = itemName.trim().toLowerCase();

	const matchedCargo = await d1
		.select({ id: cargo.id })
		.from(cargo)
		.where(
			and(
				eq(cargo.organizationId, organizationId),
				eq(cargo.name, normalized),
				or(isNull(cargo.expiresAt), gt(cargo.expiresAt, now)),
			),
		);

	if (matchedCargo.length > 0) {
		const tagMap = await getTagsForCargoIds(
			db,
			matchedCargo.map((c) => c.id),
		);
		const seen = new Map<string, TagRecord>();
		for (const c of matchedCargo) {
			for (const t of tagMap.get(c.id) ?? []) {
				seen.set(t.id, t);
			}
		}
		return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
	}

	if (sourceMealId) {
		const mealTags = await getTagsForMealIds(db, [sourceMealId]);
		return mealTags.get(sourceMealId) ?? [];
	}

	return [];
}

/** Validate tag IDs belong to org (hub widget filters). */
export async function validateTagIdsForOrg(
	db: D1Database,
	organizationId: string,
	tagIds: string[],
): Promise<string[]> {
	if (tagIds.length === 0) return [];
	const d1 = drizzle(db);
	const rows = await chunkedQuery(tagIds, (chunk) =>
		d1
			.select({ id: tag.id })
			.from(tag)
			.where(
				and(eq(tag.organizationId, organizationId), inArray(tag.id, chunk)),
			),
	);
	const valid = new Set(rows.map((r) => r.id));
	return tagIds.filter((id) => valid.has(id));
}

export async function getTagsBySlugs(
	db: D1Database,
	organizationId: string,
	slugs: string[],
): Promise<TagRecord[]> {
	const normalized = dedupeTagSlugs(slugs);
	if (normalized.length === 0) return [];

	const d1 = drizzle(db);
	const rows = await d1
		.select()
		.from(tag)
		.where(
			and(
				eq(tag.organizationId, organizationId),
				inArray(tag.slug, normalized),
			),
		);
	return rows.map(toTagRecord);
}

export async function getUnusedTags(
	db: D1Database,
	organizationId: string,
): Promise<TagWithCounts[]> {
	const all = await getOrganizationTags(db, organizationId);
	return all.filter((t) => t.cargoCount === 0 && t.mealCount === 0);
}
