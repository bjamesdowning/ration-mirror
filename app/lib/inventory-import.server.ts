/**
 * Shared bulk inventory import logic.
 *
 * Used by both the MCP `preview_inventory_import` / `apply_inventory_import`
 * tools and (in future) any HTTP endpoint that wants the same
 * preview→commit, idempotent semantics. The path is deliberately
 * credit-free: no Workers AI calls happen here. The caller (an LLM agent
 * via MCP, or a UI-side OCR pipeline) is responsible for parsing receipts.
 *
 * Storage:
 * - Preview tokens are stored in `RATION_KV` under
 *   `mcp:inv:preview:<orgId>:<token>` for 15 minutes.
 * - Idempotency keys are stored under
 *   `mcp:inv:idem:<orgId>:<key>` for 24 hours and store the original outcome.
 */

import { applyCargoImport } from "./cargo.server";
import { type ParsedCsvItem, parseInventoryCsv } from "./csv-parser";
import { ITEM_DOMAINS } from "./domain";
import { SUPPORTED_UNITS } from "./units";

export interface InventoryImportItem {
	id?: string;
	name: string;
	quantity: number;
	unit: string;
	domain?: "food" | "household" | "alcohol";
	tags?: string[];
	expiresAt?: string;
}

const PREVIEW_TTL_SECONDS = 15 * 60; // 15 minutes
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_IMPORT_ROWS = 500;

function previewKey(orgId: string, token: string) {
	return `mcp:inv:preview:${orgId}:${token}`;
}
function idempotencyKvKey(orgId: string, key: string) {
	return `mcp:inv:idem:${orgId}:${key}`;
}

/**
 * Stable canonical hash of items so the same parse produces the same token.
 * Used as a content-addressed identifier — agents that re-call preview with
 * identical inputs reuse the cache.
 */
async function hashItems(items: InventoryImportItem[]): Promise<string> {
	const canonical = items.map((i) => ({
		id: i.id ?? null,
		name: i.name.trim().toLowerCase(),
		quantity: Number(i.quantity),
		unit: i.unit.trim().toLowerCase(),
		domain: i.domain ?? "food",
		tags: (i.tags ?? []).map((t) => t.trim().toLowerCase()).sort(),
		expiresAt: i.expiresAt ?? null,
	}));
	const json = JSON.stringify(canonical);
	if (typeof crypto !== "undefined" && crypto.subtle) {
		const buf = new TextEncoder().encode(json);
		const digest = await crypto.subtle.digest("SHA-256", buf);
		return Array.from(new Uint8Array(digest))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
			.slice(0, 32);
	}
	// Fallback (test environments without WebCrypto): non-cryptographic.
	let h = 0;
	for (let i = 0; i < json.length; i++) {
		h = (h * 31 + json.charCodeAt(i)) | 0;
	}
	return `f${(h >>> 0).toString(16)}`;
}

export interface InventoryImportPreviewRow {
	index: number;
	name: string;
	quantity: number;
	unit: string;
	classification: "create" | "update" | "merge_candidate" | "invalid";
	matchId?: string;
	warnings: string[];
}

export interface InventoryImportPreview {
	previewToken: string;
	expiresAt: string;
	totals: {
		total: number;
		create: number;
		update: number;
		mergeCandidate: number;
		invalid: number;
	};
	rows: InventoryImportPreviewRow[];
	warnings: string[];
}

export interface InventoryImportApplyResult {
	imported: number;
	updated: number;
	errors: Array<{ name: string; error: string }>;
	warnings?: string[];
	replayed?: boolean;
}

/**
 * Public schema descriptor for the import shape. Returned by the MCP
 * `inventory_import_schema` tool so agents can introspect allowed unit
 * strings and field names without guessing.
 */
export function getInventoryImportSchema() {
	return {
		maxRows: MAX_IMPORT_ROWS,
		previewTtlSeconds: PREVIEW_TTL_SECONDS,
		idempotencyTtlSeconds: IDEMPOTENCY_TTL_SECONDS,
		fields: {
			id: {
				type: "string",
				format: "uuid",
				required: false,
				description:
					"Optional existing cargo id — if present and owned, the row is updated.",
			},
			name: { type: "string", required: true, minLength: 1 },
			quantity: { type: "number", required: true, exclusiveMinimum: 0 },
			unit: {
				type: "string",
				required: true,
				enum: SUPPORTED_UNITS,
				description: "Pass any alias; unknown values fall back to a default.",
			},
			domain: {
				type: "string",
				required: false,
				enum: ITEM_DOMAINS,
				default: "food",
			},
			tags: {
				type: "array",
				items: { type: "string" },
				required: false,
			},
			expiresAt: {
				type: "string",
				required: false,
				format: "date",
				description: "ISO 8601 date (YYYY-MM-DD).",
			},
		},
	};
}

interface PreviewCacheEntry {
	token: string;
	createdAt: string;
	items: InventoryImportItem[];
}

function classifyRow(
	item: InventoryImportItem,
	index: number,
	existingIds: Set<string>,
): InventoryImportPreviewRow {
	const warnings: string[] = [];
	if (!item.name?.trim()) {
		return {
			index,
			name: item.name ?? "",
			quantity: item.quantity,
			unit: item.unit,
			classification: "invalid",
			warnings: ["Missing name"],
		};
	}
	if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
		warnings.push("Quantity must be positive");
	}
	const classification: InventoryImportPreviewRow["classification"] =
		item.id && existingIds.has(item.id) ? "update" : "create";
	return {
		index,
		name: item.name,
		quantity: item.quantity,
		unit: item.unit,
		classification: warnings.length > 0 ? "invalid" : classification,
		matchId: item.id && existingIds.has(item.id) ? item.id : undefined,
		warnings,
	};
}

/**
 * Build a preview without writing. Records the items in KV under a short-lived
 * `previewToken` so `applyInventoryImport` can commit them atomically later.
 */
export async function previewInventoryImport(
	env: Cloudflare.Env,
	organizationId: string,
	rawItems: InventoryImportItem[],
): Promise<InventoryImportPreview> {
	const items = rawItems.slice(0, MAX_IMPORT_ROWS);
	const warnings: string[] = [];
	if (rawItems.length > MAX_IMPORT_ROWS) {
		warnings.push(
			`Truncated to ${MAX_IMPORT_ROWS} rows (received ${rawItems.length}).`,
		);
	}

	// Cheap existence check for the user-supplied ids (no full-table scan).
	const submittedIds = items
		.map((i) => i.id)
		.filter((id): id is string => typeof id === "string" && id.length > 0);
	const existingIds = new Set<string>();
	if (submittedIds.length > 0) {
		// Reuse Drizzle from cargo.server via dynamic import to avoid a circular dep.
		const { drizzle } = await import("drizzle-orm/d1");
		const { inArray, eq, and } = await import("drizzle-orm");
		const { cargo } = await import("../db/schema");
		const d1 = drizzle(env.DB);
		const { chunkedQuery } = await import("./query-utils.server");
		const rows = await chunkedQuery(submittedIds, (chunk) =>
			d1
				.select({ id: cargo.id })
				.from(cargo)
				.where(
					and(
						eq(cargo.organizationId, organizationId),
						inArray(cargo.id, chunk),
					),
				),
		);
		for (const r of rows) existingIds.add(r.id);
	}

	const rows: InventoryImportPreviewRow[] = items.map((item, idx) =>
		classifyRow(item, idx, existingIds),
	);
	const totals = rows.reduce(
		(acc, r) => {
			acc.total += 1;
			if (r.classification === "create") acc.create += 1;
			else if (r.classification === "update") acc.update += 1;
			else if (r.classification === "merge_candidate") acc.mergeCandidate += 1;
			else acc.invalid += 1;
			return acc;
		},
		{ total: 0, create: 0, update: 0, mergeCandidate: 0, invalid: 0 },
	);

	const token = await hashItems(items);
	const cache: PreviewCacheEntry = {
		token,
		createdAt: new Date().toISOString(),
		items,
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
		rows,
		warnings,
	};
}

interface ApplyOptions {
	previewToken: string;
	idempotencyKey: string;
	apiKeyId: string;
}

/**
 * Commit a previously-previewed import. Idempotent on `idempotencyKey`:
 * replaying with the same key within 24h returns the original outcome with
 * `replayed: true`.
 */
export async function applyInventoryImport(
	env: Cloudflare.Env,
	organizationId: string,
	opts: ApplyOptions,
): Promise<InventoryImportApplyResult> {
	const idemKey = idempotencyKvKey(organizationId, opts.idempotencyKey);
	const cached = await env.RATION_KV.get(idemKey, "json");
	if (cached) {
		return {
			...(cached as InventoryImportApplyResult),
			replayed: true,
		};
	}

	const cacheRaw = await env.RATION_KV.get(
		previewKey(organizationId, opts.previewToken),
		"json",
	);
	if (!cacheRaw) {
		throw new Error(
			"Preview token not found or expired. Call preview_inventory_import again.",
		);
	}
	const cache = cacheRaw as PreviewCacheEntry;

	const parsed: ParsedCsvItem[] = cache.items.map((i) => ({
		id: i.id,
		name: i.name,
		quantity: i.quantity,
		unit: i.unit,
		domain: i.domain,
		tags: i.tags,
		expiresAt: i.expiresAt,
	}));
	const result = await applyCargoImport(env, organizationId, parsed);
	const outcome: InventoryImportApplyResult = {
		imported: result.imported,
		updated: result.updated,
		errors: result.errors,
	};
	await env.RATION_KV.put(idemKey, JSON.stringify(outcome), {
		expirationTtl: IDEMPOTENCY_TTL_SECONDS,
	});
	// Clean up the preview cache once committed.
	await env.RATION_KV.delete(previewKey(organizationId, opts.previewToken));
	return outcome;
}

interface CsvOptions {
	csv: string;
	idempotencyKey: string;
	apiKeyId: string;
}

/**
 * Convenience: parse a CSV string and apply in one call. Idempotent.
 */
export async function importInventoryCsv(
	env: Cloudflare.Env,
	organizationId: string,
	opts: CsvOptions,
): Promise<InventoryImportApplyResult> {
	const idemKey = idempotencyKvKey(organizationId, opts.idempotencyKey);
	const cached = await env.RATION_KV.get(idemKey, "json");
	if (cached) {
		return {
			...(cached as InventoryImportApplyResult),
			replayed: true,
		};
	}
	const { items, warnings } = parseInventoryCsv(opts.csv);
	if (items.length === 0) {
		const outcome: InventoryImportApplyResult = {
			imported: 0,
			updated: 0,
			errors: [{ name: "(csv)", error: "No valid rows in CSV" }],
			warnings,
		};
		return outcome;
	}
	const result = await applyCargoImport(env, organizationId, items);
	const outcome: InventoryImportApplyResult = {
		imported: result.imported,
		updated: result.updated,
		errors: result.errors,
		warnings: warnings.length > 0 ? warnings : undefined,
	};
	await env.RATION_KV.put(idemKey, JSON.stringify(outcome), {
		expirationTtl: IDEMPOTENCY_TTL_SECONDS,
	});
	return outcome;
}
