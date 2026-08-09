#!/usr/bin/env bun
/**
 * Convert USDA FoodData Central CSV exports into ration-nutrition D1 SQL.
 *
 * Expects unzipped CSV packages under nutrition-db/raw/:
 *   FoodData_Central_sr_legacy_food_csv_*
 *   FoodData_Central_foundation_food_csv_*
 *
 * Release metadata: nutrition-db/releases/current.json
 * Never promote nutrition-db/seed-minimal.sql to production.
 *
 * Usage:
 *   bun scripts/import-fdc-nutrition.ts
 *   bun scripts/import-fdc-nutrition.ts --apply-local
 *   bun scripts/import-fdc-nutrition.ts --apply-remote --db=ration-nutrition-dev
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";
import {
	applyImportNutrient,
	emptyImportNutrients,
	finalizeImportSalt,
	type ImportWideNutrients,
} from "../app/lib/nutrition/fdc-import-rules";

const ROOT = path.join(import.meta.dir, "..");
const RAW_DIR = path.join(ROOT, "nutrition-db", "raw");
const OUT_DIR = path.join(ROOT, "nutrition-db", "generated");
const SCHEMA = path.join(ROOT, "nutrition-db", "schema.sql");
const RELEASE_MANIFEST = path.join(
	ROOT,
	"nutrition-db",
	"releases",
	"current.json",
);

const ALLOWED_DATA_TYPES = new Set(["sr_legacy_food", "foundation_food"]);

type FoodRow = {
	fdcId: number;
	description: string;
	dataType: string;
};

type PortionRow = {
	id: number | null;
	fdcId: number;
	modifier: string | null;
	gramWeight: number;
	amount: number | null;
	measureUnit: string | null;
};

type ReleaseManifest = {
	schemaVersion: number;
	datasetSnapshotId: string;
	status: string;
	note?: string;
	datasets: Array<{
		dataType: string;
		packageHint?: string;
		officialUrl: string | null;
		publicationDate: string | null;
		archiveSha256: string | null;
	}>;
	matcherVersion: string;
	portionMatcherVersion: string;
	importedAt: string | null;
	rowCounts: {
		food: number;
		nutrient: number;
		portion: number;
	} | null;
	snapshotHash: string | null;
};

function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function sqlNum(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "NULL";
	return String(value);
}

/** Streaming RFC4180 CSV row iterator (does not load the whole file into RAM). */
async function* iterateCsvRows(filePath: string): AsyncGenerator<string[]> {
	const stream = createReadStream(filePath, { encoding: "utf8" });
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	for await (const chunk of stream) {
		const text = typeof chunk === "string" ? chunk : String(chunk);
		let i = 0;
		while (i < text.length) {
			const c = text[i];
			if (inQuotes) {
				if (c === '"') {
					if (text[i + 1] === '"') {
						field += '"';
						i += 2;
						continue;
					}
					inQuotes = false;
					i += 1;
					continue;
				}
				field += c;
				i += 1;
				continue;
			}
			if (c === '"') {
				inQuotes = true;
				i += 1;
				continue;
			}
			if (c === ",") {
				row.push(field);
				field = "";
				i += 1;
				continue;
			}
			if (c === "\n" || c === "\r") {
				if (c === "\r" && text[i + 1] === "\n") i += 1;
				row.push(field);
				field = "";
				if (row.length > 1 || row[0] !== "") yield row;
				row = [];
				i += 1;
				continue;
			}
			field += c;
			i += 1;
		}
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		if (row.length > 1 || row[0] !== "") yield row;
	}
}

function headerIndex(header: string[], name: string): number {
	const idx = header.indexOf(name);
	if (idx < 0) throw new Error(`CSV missing column "${name}"`);
	return idx;
}

async function findDatasetDirs(): Promise<{
	srLegacy?: string;
	foundation?: string;
}> {
	const entries = await readdir(RAW_DIR, { withFileTypes: true });
	const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
	const srLegacy = dirs.find((d) => d.includes("sr_legacy_food_csv"));
	const foundation = dirs.find((d) => d.includes("foundation_food_csv"));
	return {
		srLegacy: srLegacy ? path.join(RAW_DIR, srLegacy) : undefined,
		foundation: foundation ? path.join(RAW_DIR, foundation) : undefined,
	};
}

async function loadReleaseManifest(): Promise<ReleaseManifest> {
	const raw = await readFile(RELEASE_MANIFEST, "utf8");
	return JSON.parse(raw) as ReleaseManifest;
}

async function loadFoods(
	dir: string,
	foods: Map<number, FoodRow>,
): Promise<number> {
	const filePath = path.join(dir, "food.csv");
	let header: string[] | null = null;
	let iFdc = -1;
	let iType = -1;
	let iDesc = -1;
	let added = 0;
	for await (const row of iterateCsvRows(filePath)) {
		if (!header) {
			header = row;
			iFdc = headerIndex(header, "fdc_id");
			iType = headerIndex(header, "data_type");
			iDesc = headerIndex(header, "description");
			continue;
		}
		const dataType = row[iType]?.trim() ?? "";
		if (!ALLOWED_DATA_TYPES.has(dataType)) continue;
		const fdcId = Number(row[iFdc]);
		const description = (row[iDesc] ?? "").trim();
		if (!Number.isFinite(fdcId) || !description) continue;
		const existing = foods.get(fdcId);
		if (existing && existing.dataType === "foundation_food") continue;
		if (existing && dataType === "sr_legacy_food") continue;
		foods.set(fdcId, { fdcId, description, dataType });
		added += 1;
	}
	return added;
}

async function loadNutrients(
	dir: string,
	foods: Map<number, FoodRow>,
	nutrients: Map<number, ImportWideNutrients>,
): Promise<void> {
	const filePath = path.join(dir, "food_nutrient.csv");
	let header: string[] | null = null;
	let iFdc = -1;
	let iNut = -1;
	let iAmt = -1;
	for await (const row of iterateCsvRows(filePath)) {
		if (!header) {
			header = row;
			iFdc = headerIndex(header, "fdc_id");
			iNut = headerIndex(header, "nutrient_id");
			iAmt = headerIndex(header, "amount");
			continue;
		}
		const fdcId = Number(row[iFdc]);
		const food = foods.get(fdcId);
		if (!food) continue;
		const nutrientId = Number(row[iNut]);
		const amount = Number(row[iAmt]);
		if (!Number.isFinite(nutrientId) || !Number.isFinite(amount)) continue;

		let wide = nutrients.get(fdcId);
		if (!wide) {
			wide = emptyImportNutrients();
			nutrients.set(fdcId, wide);
		}
		applyImportNutrient(wide, nutrientId, amount, food.dataType);
	}
}

async function loadMeasureUnits(dir: string): Promise<Map<number, string>> {
	const map = new Map<number, string>();
	const filePath = path.join(dir, "measure_unit.csv");
	try {
		await readFile(filePath);
	} catch {
		return map;
	}
	let header: string[] | null = null;
	let iId = -1;
	let iName = -1;
	for await (const row of iterateCsvRows(filePath)) {
		if (!header) {
			header = row;
			iId = headerIndex(header, "id");
			iName = headerIndex(header, "name");
			continue;
		}
		const id = Number(row[iId]);
		const name = (row[iName] ?? "").trim();
		if (Number.isFinite(id) && name) map.set(id, name);
	}
	return map;
}

async function loadPortions(
	dir: string,
	foodIds: Set<number>,
	units: Map<number, string>,
	portions: PortionRow[],
): Promise<void> {
	const filePath = path.join(dir, "food_portion.csv");
	try {
		await readFile(filePath);
	} catch {
		return;
	}
	let header: string[] | null = null;
	let iId = -1;
	let iFdc = -1;
	let iAmount = -1;
	let iUnit = -1;
	let iMod = -1;
	let iGram = -1;
	let iDesc = -1;
	for await (const row of iterateCsvRows(filePath)) {
		if (!header) {
			header = row;
			iId = header.includes("id") ? headerIndex(header, "id") : -1;
			iFdc = headerIndex(header, "fdc_id");
			iAmount = headerIndex(header, "amount");
			iUnit = headerIndex(header, "measure_unit_id");
			iMod = headerIndex(header, "modifier");
			iGram = headerIndex(header, "gram_weight");
			iDesc = header.includes("portion_description")
				? headerIndex(header, "portion_description")
				: -1;
			continue;
		}
		const fdcId = Number(row[iFdc]);
		if (!foodIds.has(fdcId)) continue;
		const gramWeight = Number(row[iGram]);
		if (!Number.isFinite(gramWeight) || gramWeight <= 0) continue;
		const amountRaw = row[iAmount]?.trim() ?? "";
		const amount = amountRaw === "" ? null : Number(amountRaw);
		const unitId = Number(row[iUnit]);
		const unitName = Number.isFinite(unitId)
			? (units.get(unitId) ?? null)
			: null;
		const modifier =
			row[iMod]?.trim() || (iDesc >= 0 ? row[iDesc]?.trim() : "") || null;
		const idRaw = iId >= 0 ? Number(row[iId]) : Number.NaN;
		portions.push({
			id: Number.isFinite(idRaw) ? idRaw : null,
			fdcId,
			modifier: modifier || null,
			gramWeight,
			amount: amount != null && Number.isFinite(amount) ? amount : null,
			measureUnit: unitName,
		});
	}
}

function chunkArray<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}

function computeSnapshotHash(parts: string[]): string {
	const hash = createHash("sha256");
	for (const p of parts) hash.update(p);
	return hash.digest("hex");
}

async function generate(): Promise<string[]> {
	const manifest = await loadReleaseManifest();
	const datasets = await findDatasetDirs();
	if (!datasets.srLegacy && !datasets.foundation) {
		throw new Error(
			`No FDC CSV folders found under ${RAW_DIR}. Expected *sr_legacy_food_csv* and/or *foundation_food_csv*.`,
		);
	}

	const foods = new Map<number, FoodRow>();
	if (datasets.srLegacy) {
		const n = await loadFoods(datasets.srLegacy, foods);
		console.log(`SR Legacy foods: ${n}`);
	}
	if (datasets.foundation) {
		const n = await loadFoods(datasets.foundation, foods);
		console.log(`Foundation foods added/updated: ${n}`);
	}

	const foodIds = new Set(foods.keys());
	const nutrients = new Map<number, ImportWideNutrients>();

	if (datasets.srLegacy) {
		console.log("Pivoting SR Legacy nutrients (stream)…");
		await loadNutrients(datasets.srLegacy, foods, nutrients);
	}
	if (datasets.foundation) {
		console.log("Pivoting Foundation nutrients (stream)…");
		await loadNutrients(datasets.foundation, foods, nutrients);
	}
	for (const wide of nutrients.values()) {
		finalizeImportSalt(wide);
	}

	const portions: PortionRow[] = [];
	if (datasets.srLegacy) {
		const units = await loadMeasureUnits(datasets.srLegacy);
		await loadPortions(datasets.srLegacy, foodIds, units, portions);
	}
	if (datasets.foundation) {
		const units = await loadMeasureUnits(datasets.foundation);
		await loadPortions(datasets.foundation, foodIds, units, portions);
	}

	const foodList = [...foods.values()].sort((a, b) => a.fdcId - b.fdcId);
	const withMacros = foodList.filter((f) => nutrients.has(f.fdcId));

	console.log(
		`Foods: ${foodList.length}; with macros: ${withMacros.length}; portions: ${portions.length}`,
	);

	await mkdir(OUT_DIR, { recursive: true });

	const written: string[] = [];
	const clearPath = path.join(OUT_DIR, "00-clear.sql");
	await writeFile(
		clearPath,
		`-- Clear existing nutrition reference data (keep schema)
-- WARNING: Never run against the active production binding. Promote via new D1 + binding change.
PRAGMA foreign_keys = OFF;
DELETE FROM food_portion;
DELETE FROM food_nutrient;
DELETE FROM food;
DELETE FROM food_fts;
DELETE FROM dataset_release;
DELETE FROM database_snapshot;
PRAGMA foreign_keys = ON;
`,
	);
	written.push(clearPath);

	const FOOD_CHUNK = 200;
	const foodChunks = chunkArray(withMacros, FOOD_CHUNK);
	const hashParts: string[] = [];
	for (let i = 0; i < foodChunks.length; i++) {
		const chunk = foodChunks[i] ?? [];
		const lines: string[] = [
			`INSERT OR REPLACE INTO food (fdc_id, description, data_type) VALUES`,
		];
		lines.push(
			chunk
				.map(
					(f) =>
						`(${f.fdcId}, ${sqlString(f.description)}, ${sqlString(f.dataType)})`,
				)
				.join(",\n") + ";",
		);

		lines.push(
			`INSERT OR REPLACE INTO food_nutrient (fdc_id, energy_kcal, protein_g, fat_g, carb_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, salt_g, energy_nutrient_id, salt_derivation) VALUES`,
		);
		lines.push(
			chunk
				.map((f) => {
					const n = nutrients.get(f.fdcId) ?? emptyImportNutrients();
					hashParts.push(
						`${f.fdcId}|${n.energy_kcal}|${n.protein_g}|${n.fat_g}|${n.carb_g}|${n.energy_nutrient_id}`,
					);
					return `(${f.fdcId}, ${sqlNum(n.energy_kcal)}, ${sqlNum(n.protein_g)}, ${sqlNum(n.fat_g)}, ${sqlNum(n.carb_g)}, ${sqlNum(n.fiber_g)}, ${sqlNum(n.sugar_g)}, ${sqlNum(n.sat_fat_g)}, ${sqlNum(n.sodium_mg)}, ${sqlNum(n.salt_g)}, ${sqlNum(n.energy_nutrient_id)}, ${n.salt_derivation ? sqlString(n.salt_derivation) : "NULL"})`;
				})
				.join(",\n") + ";",
		);

		const out = path.join(
			OUT_DIR,
			`01-foods-${String(i + 1).padStart(3, "0")}.sql`,
		);
		await writeFile(out, `${lines.join("\n")}\n`);
		written.push(out);
	}

	const portionChunks = chunkArray(portions, 400);
	for (let i = 0; i < portionChunks.length; i++) {
		const chunk = portionChunks[i] ?? [];
		if (chunk.length === 0) continue;
		const known = chunk.filter((p) => nutrients.has(p.fdcId));
		if (known.length === 0) continue;
		const withIds = known.filter((p) => p.id != null);
		const withoutIds = known.filter((p) => p.id == null);
		const parts: string[] = [];
		if (withIds.length > 0) {
			parts.push(
				`INSERT OR REPLACE INTO food_portion (id, fdc_id, modifier, gram_weight, amount, measure_unit) VALUES`,
				withIds
					.map(
						(p) =>
							`(${p.id}, ${p.fdcId}, ${p.modifier ? sqlString(p.modifier) : "NULL"}, ${p.gramWeight}, ${sqlNum(p.amount)}, ${p.measureUnit ? sqlString(p.measureUnit) : "NULL"})`,
					)
					.join(",\n") + ";",
			);
		}
		if (withoutIds.length > 0) {
			parts.push(
				`INSERT INTO food_portion (fdc_id, modifier, gram_weight, amount, measure_unit) VALUES`,
				withoutIds
					.map(
						(p) =>
							`(${p.fdcId}, ${p.modifier ? sqlString(p.modifier) : "NULL"}, ${p.gramWeight}, ${sqlNum(p.amount)}, ${p.measureUnit ? sqlString(p.measureUnit) : "NULL"})`,
					)
					.join(",\n") + ";",
			);
		}
		const out = path.join(
			OUT_DIR,
			`02-portions-${String(i + 1).padStart(3, "0")}.sql`,
		);
		await writeFile(out, `${parts.join("\n")}\n`);
		written.push(out);
	}

	const snapshotHash = computeSnapshotHash(hashParts);
	const importedAt = Math.floor(Date.now() / 1000);
	const snapshotId =
		manifest.datasetSnapshotId === "dev-unpinned"
			? `fdc-${new Date().toISOString().slice(0, 10)}-${snapshotHash.slice(0, 12)}`
			: manifest.datasetSnapshotId;

	const releaseSql: string[] = [];
	for (const ds of manifest.datasets) {
		const releaseId = `${ds.dataType}:${ds.publicationDate ?? "unknown"}`;
		const countFood = withMacros.filter(
			(f) => f.dataType === ds.dataType,
		).length;
		releaseSql.push(
			`INSERT OR REPLACE INTO dataset_release (id, data_type, official_url, publication_date, archive_sha256, imported_at, row_count_food, row_count_nutrient, row_count_portion) VALUES (${sqlString(releaseId)}, ${sqlString(ds.dataType)}, ${ds.officialUrl ? sqlString(ds.officialUrl) : "NULL"}, ${ds.publicationDate ? sqlString(ds.publicationDate) : "NULL"}, ${ds.archiveSha256 ? sqlString(ds.archiveSha256) : "NULL"}, ${importedAt}, ${countFood}, ${countFood}, ${portions.filter((p) => foods.get(p.fdcId)?.dataType === ds.dataType).length});`,
		);
	}
	const releaseIds = manifest.datasets.map(
		(ds) => `${ds.dataType}:${ds.publicationDate ?? "unknown"}`,
	);
	releaseSql.push(
		`INSERT OR REPLACE INTO database_snapshot (id, created_at, snapshot_hash, matcher_floor, release_ids_json, notes) VALUES (${sqlString(snapshotId)}, ${importedAt}, ${sqlString(snapshotHash)}, ${sqlString(manifest.matcherVersion)}, ${sqlString(JSON.stringify(releaseIds))}, ${sqlString("Generated by import-fdc-nutrition.ts")});`,
	);

	const metaPath = path.join(OUT_DIR, "03-release-metadata.sql");
	await writeFile(metaPath, `${releaseSql.join("\n")}\n`);
	written.push(metaPath);

	const ftsPath = path.join(OUT_DIR, "99-fts-rebuild.sql");
	await writeFile(
		ftsPath,
		`-- Rebuild FTS5 index from food.content
INSERT INTO food_fts(food_fts) VALUES('rebuild');
`,
	);
	written.push(ftsPath);

	const updatedManifest: ReleaseManifest = {
		...manifest,
		datasetSnapshotId: snapshotId,
		status: "generated",
		importedAt: new Date(importedAt * 1000).toISOString(),
		rowCounts: {
			food: withMacros.length,
			nutrient: withMacros.length,
			portion: portions.length,
		},
		snapshotHash,
		note: "Generated locally — verify checksums and golden accuracy before enabling nutrition-engine for App Review. seed-minimal.sql must never be promoted.",
	};
	await writeFile(
		path.join(OUT_DIR, "release-manifest.json"),
		`${JSON.stringify(updatedManifest, null, "\t")}\n`,
	);

	const manifestTxt = path.join(OUT_DIR, "MANIFEST.txt");
	await writeFile(
		manifestTxt,
		[
			`generatedAt=${new Date().toISOString()}`,
			`snapshotId=${snapshotId}`,
			`snapshotHash=${snapshotHash}`,
			`foods=${withMacros.length}`,
			`portions=${portions.length}`,
			`files=${written.length}`,
			...written.map((f) => path.relative(ROOT, f)),
			"",
		].join("\n"),
	);

	console.log(
		`Wrote ${written.length} SQL files to ${path.relative(ROOT, OUT_DIR)} (snapshot ${snapshotId})`,
	);
	return written;
}

async function applyFiles(
	files: string[],
	opts: { remote: boolean; db: string },
): Promise<void> {
	if (opts.remote) {
		const manifest = await loadReleaseManifest();
		const missingSha = manifest.datasets.some((d) => !d.archiveSha256);
		if (missingSha) {
			throw new Error(
				"Refusing --apply-remote: nutrition-db/releases/current.json is missing archiveSha256 for one or more datasets. Pin verified archives before remote apply.",
			);
		}
	}

	console.log(
		`Applying schema to ${opts.db} (${opts.remote ? "remote" : "local"})…`,
	);
	if (opts.remote) {
		await $`bunx wrangler d1 execute ${opts.db} --remote --file=${SCHEMA}`;
	} else {
		await $`bunx wrangler d1 execute ${opts.db} --local --file=${SCHEMA}`;
	}

	for (const file of files) {
		const rel = path.relative(ROOT, file);
		console.log(`Applying ${rel}…`);
		if (opts.remote) {
			await $`bunx wrangler d1 execute ${opts.db} --remote --file=${file}`;
		} else {
			await $`bunx wrangler d1 execute ${opts.db} --local --file=${file}`;
		}
	}
	console.log("Apply complete.");
}

function printHelp(): void {
	console.log(`FDC → ration-nutrition import

Usage:
  bun scripts/import-fdc-nutrition.ts
  bun scripts/import-fdc-nutrition.ts --apply-local
  bun scripts/import-fdc-nutrition.ts --apply-remote
  bun scripts/import-fdc-nutrition.ts --apply-remote --db=ration-nutrition-dev

Inputs:  nutrition-db/raw/FoodData_Central_*_csv_*/
         nutrition-db/releases/current.json
Outputs: nutrition-db/generated/*.sql  (gitignored)

Remote apply requires archiveSha256 pins in the release manifest.
Never promote seed-minimal.sql to production reviewers.
`);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
	printHelp();
	process.exit(0);
}

const dbArg = args.find((a) => a.startsWith("--db="));
const db = dbArg?.slice("--db=".length) || "ration-nutrition";
const applyRemote = args.includes("--apply-remote");
const applyLocal = args.includes("--apply-local");

const files = await generate();
if (applyRemote || applyLocal) {
	await applyFiles(files, { remote: applyRemote, db });
} else {
	console.log(`
Next:
  bun scripts/import-fdc-nutrition.ts --apply-local
  # Remote only after archive SHA pins + staging verification:
  bun scripts/import-fdc-nutrition.ts --apply-remote --db=ration-nutrition-dev
`);
}
