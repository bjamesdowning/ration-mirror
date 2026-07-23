/**
 * Bulk cargo remove: preview → apply (chat confirm; no host approval card).
 * Mirrors inventory-import.server.ts KV/idempotency patterns.
 */

import { getCargoByIds, jettisonItem } from "./cargo.server";
import { sha256Hex } from "./crypto.server";
import { INVENTORY_IMPORT_PREVIEW_SAMPLE_ROWS } from "./mcp/constants";

const PREVIEW_TTL_SECONDS = 15 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const MAX_REMOVE_ROWS = 100;
const PREVIEW_SAMPLE_ROWS = INVENTORY_IMPORT_PREVIEW_SAMPLE_ROWS;

function previewKey(orgId: string, token: string) {
	return `mcp:inv:remove:preview:${orgId}:${token}`;
}
function idempotencyKvKey(orgId: string, key: string) {
	return `mcp:inv:remove:idem:${orgId}:${key}`;
}

export interface InventoryRemovePreviewRow {
	index: number;
	itemId: string;
	name: string | null;
	classification: "remove" | "not_found";
}

export interface InventoryRemovePreview {
	previewToken: string;
	expiresAt: string;
	totals: {
		total: number;
		remove: number;
		notFound: number;
	};
	rows: InventoryRemovePreviewRow[];
	rowsOmitted: number;
	warnings: string[];
}

export interface InventoryRemoveApplyResult {
	removed: number;
	notFound: string[];
	itemIds: string[];
	replayed?: boolean;
}

interface PreviewCacheEntry {
	token: string;
	createdAt: string;
	itemIds: string[];
}

async function hashItemIds(itemIds: string[]): Promise<string> {
	const canonical = [...itemIds].map((id) => id.trim().toLowerCase()).sort();
	return sha256Hex(JSON.stringify(canonical), 32);
}

export async function previewInventoryRemove(
	env: Cloudflare.Env,
	organizationId: string,
	rawItemIds: string[],
): Promise<InventoryRemovePreview> {
	const uniqueIds = [
		...new Set(rawItemIds.map((id) => id.trim()).filter(Boolean)),
	].slice(0, MAX_REMOVE_ROWS);
	const warnings: string[] = [];
	if (rawItemIds.length > MAX_REMOVE_ROWS) {
		warnings.push(
			`Truncated to ${MAX_REMOVE_ROWS} ids (received ${rawItemIds.length}).`,
		);
	}
	if (uniqueIds.length < rawItemIds.filter(Boolean).length) {
		warnings.push("Duplicate item ids were de-duplicated.");
	}

	const existing = await getCargoByIds(env.DB, organizationId, uniqueIds);
	const byId = new Map(existing.map((item) => [item.id, item]));

	const rows: InventoryRemovePreviewRow[] = uniqueIds.map((itemId, index) => {
		const found = byId.get(itemId);
		return {
			index,
			itemId,
			name: found?.name ?? null,
			classification: found ? "remove" : "not_found",
		};
	});

	const totals = rows.reduce(
		(acc, row) => {
			acc.total += 1;
			if (row.classification === "remove") acc.remove += 1;
			else acc.notFound += 1;
			return acc;
		},
		{ total: 0, remove: 0, notFound: 0 },
	);

	const removableIds = rows
		.filter((row) => row.classification === "remove")
		.map((row) => row.itemId);
	const token = await hashItemIds(removableIds);
	const cache: PreviewCacheEntry = {
		token,
		createdAt: new Date().toISOString(),
		itemIds: removableIds,
	};
	await env.RATION_KV.put(
		previewKey(organizationId, token),
		JSON.stringify(cache),
		{ expirationTtl: PREVIEW_TTL_SECONDS },
	);

	return {
		previewToken: token,
		expiresAt: new Date(Date.now() + PREVIEW_TTL_SECONDS * 1000).toISOString(),
		totals,
		rows: rows.slice(0, PREVIEW_SAMPLE_ROWS),
		rowsOmitted: Math.max(0, rows.length - PREVIEW_SAMPLE_ROWS),
		warnings,
	};
}

export async function applyInventoryRemove(
	env: Cloudflare.Env,
	organizationId: string,
	opts: {
		previewToken: string;
		idempotencyKey: string;
	},
): Promise<InventoryRemoveApplyResult> {
	const idemKey = idempotencyKvKey(organizationId, opts.idempotencyKey);
	const cached = await env.RATION_KV.get(idemKey, "json");
	if (cached) {
		return {
			...(cached as InventoryRemoveApplyResult),
			replayed: true,
		};
	}

	const cacheRaw = await env.RATION_KV.get(
		previewKey(organizationId, opts.previewToken),
		"json",
	);
	if (!cacheRaw) {
		throw new Error(
			"Preview token not found or expired. Call preview_inventory_remove again.",
		);
	}
	const preview = cacheRaw as PreviewCacheEntry;
	const itemIds = preview.itemIds ?? [];

	const existing = await getCargoByIds(env.DB, organizationId, itemIds);
	const existingIds = new Set(existing.map((item) => item.id));
	const toRemove = itemIds.filter((id) => existingIds.has(id));
	const notFound = itemIds.filter((id) => !existingIds.has(id));

	// Sequential jettison keeps D1 write contention low; vector deletes are fire-and-forget.
	for (const itemId of toRemove) {
		await jettisonItem(env, organizationId, itemId);
	}

	const result: InventoryRemoveApplyResult = {
		removed: toRemove.length,
		notFound,
		itemIds: toRemove,
	};
	await env.RATION_KV.put(idemKey, JSON.stringify(result), {
		expirationTtl: IDEMPOTENCY_TTL_SECONDS,
	});
	await env.RATION_KV.delete(previewKey(organizationId, opts.previewToken));
	return result;
}
