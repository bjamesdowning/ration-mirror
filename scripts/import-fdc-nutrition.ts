#!/usr/bin/env bun
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
/**
 * Convert USDA FoodData Central CSV exports into ration-nutrition D1 SQL.
 *
 * Expects unzipped CSV packages under nutrition-db/raw/:
 *   FoodData_Central_sr_legacy_food_csv_*
 *   FoodData_Central_foundation_food_csv_*
 *
 * Usage:
 *   bun scripts/import-fdc-nutrition.ts              # generate SQL chunks
 *   bun scripts/import-fdc-nutrition.ts --apply-local
 *   bun scripts/import-fdc-nutrition.ts --apply-remote
 *   bun scripts/import-fdc-nutrition.ts --apply-remote --db=ration-nutrition-dev
 *
 * Nutrient mapping (FDC nutrient_id → our wide columns):
 *   1008/2047/2048 → energy_kcal, 1003 protein, 1004 fat, 1005 carb,
 *   1079 fiber, 2000/1063 sugar, 1258 sat fat, 1093 sodium (salt = Na*2.5/1000)
 */
import { $ } from "bun";

const ROOT = path.join(import.meta.dir, "..");
const RAW_DIR = path.join(ROOT, "nutrition-db", "raw");
const OUT_DIR = path.join(ROOT, "nutrition-db", "generated");
const SCHEMA = path.join(ROOT, "nutrition-db", "schema.sql");

const ALLOWED_DATA_TYPES = new Set(["sr_legacy_food", "foundation_food"]);

/** Prefer earlier ids when filling the same column. */
const NUTRIENT_COLUMNS: Record<number, keyof WideNutrients> = {
	1008: "energy_kcal",
	2047: "energy_kcal",
	2048: "energy_kcal",
	1003: "protein_g",
	1004: "fat_g",
	1005: "carb_g",
	1079: "fiber_g",
	2000: "sugar_g",
	1063: "sugar_g",
	1258: "sat_fat_g",
	1093: "sodium_mg",
};

type WideNutrients = {
	energy_kcal: number | null;
	protein_g: number | null;
	fat_g: number | null;
	carb_g: number | null;
	fiber_g: number | null;
	sugar_g: number | null;
	sat_fat_g: number | null;
	sodium_mg: number | null;
	salt_g: number | null;
};

type FoodRow = {
	fdcId: number;
	description: string;
	dataType: string;
};

type PortionRow = {
	fdcId: number;
	modifier: string | null;
	gramWeight: number;
	amount: number | null;
	measureUnit: string | null;
};

function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function sqlNum(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "NULL";
	return String(value);
}

/** Minimal RFC4180 CSV parser (handles quotes / commas / newlines in fields). */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let i = 0;
	let inQuotes = false;

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
			if (row.length > 1 || row[0] !== "") rows.push(row);
			row = [];
			i += 1;
			continue;
		}
		field += c;
		i += 1;
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
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

function emptyNutrients(): WideNutrients {
	return {
		energy_kcal: null,
		protein_g: null,
		fat_g: null,
		carb_g: null,
		fiber_g: null,
		sugar_g: null,
		sat_fat_g: null,
		sodium_mg: null,
		salt_g: null,
	};
}

function applyNutrient(
	target: WideNutrients,
	nutrientId: number,
	amount: number,
): void {
	if (!Number.isFinite(amount)) return;

	// Energy: prefer 1008, then Atwater fallbacks only if empty.
	if (nutrientId === 1008) {
		target.energy_kcal = amount;
		return;
	}
	if (nutrientId === 2047 || nutrientId === 2048) {
		if (target.energy_kcal == null) target.energy_kcal = amount;
		return;
	}
	// Sugar: prefer 2000 over 1063.
	if (nutrientId === 2000) {
		target.sugar_g = amount;
		return;
	}
	if (nutrientId === 1063) {
		if (target.sugar_g == null) target.sugar_g = amount;
		return;
	}

	const col = NUTRIENT_COLUMNS[nutrientId];
	if (!col) return;
	if (target[col] == null) {
		target[col] = amount;
	}
}

async function loadFoods(
	dir: string,
	foods: Map<number, FoodRow>,
): Promise<number> {
	const text = await Bun.file(path.join(dir, "food.csv")).text();
	const rows = parseCsv(text);
	const header = rows[0];
	if (!header) return 0;
	const iFdc = headerIndex(header, "fdc_id");
	const iType = headerIndex(header, "data_type");
	const iDesc = headerIndex(header, "description");
	let added = 0;
	for (let r = 1; r < rows.length; r++) {
		const row = rows[r];
		if (!row) continue;
		const dataType = row[iType]?.trim() ?? "";
		if (!ALLOWED_DATA_TYPES.has(dataType)) continue;
		const fdcId = Number(row[iFdc]);
		const description = (row[iDesc] ?? "").trim();
		if (!Number.isFinite(fdcId) || !description) continue;
		const existing = foods.get(fdcId);
		// Foundation wins over SR Legacy on id collision (rare).
		if (existing && existing.dataType === "foundation_food") continue;
		if (existing && dataType === "sr_legacy_food") continue;
		foods.set(fdcId, { fdcId, description, dataType });
		added += 1;
	}
	return added;
}

async function loadNutrients(
	dir: string,
	foodIds: Set<number>,
	nutrients: Map<number, WideNutrients>,
): Promise<void> {
	const text = await Bun.file(path.join(dir, "food_nutrient.csv")).text();
	const rows = parseCsv(text);
	const header = rows[0];
	if (!header) return;
	const iFdc = headerIndex(header, "fdc_id");
	const iNut = headerIndex(header, "nutrient_id");
	const iAmt = headerIndex(header, "amount");

	for (let r = 1; r < rows.length; r++) {
		const row = rows[r];
		if (!row) continue;
		const fdcId = Number(row[iFdc]);
		if (!foodIds.has(fdcId)) continue;
		const nutrientId = Number(row[iNut]);
		if (!(nutrientId in NUTRIENT_COLUMNS)) continue;
		const amount = Number(row[iAmt]);
		if (!Number.isFinite(amount)) continue;

		let wide = nutrients.get(fdcId);
		if (!wide) {
			wide = emptyNutrients();
			nutrients.set(fdcId, wide);
		}
		applyNutrient(wide, nutrientId, amount);
	}
}

async function loadMeasureUnits(dir: string): Promise<Map<number, string>> {
	const map = new Map<number, string>();
	const file = Bun.file(path.join(dir, "measure_unit.csv"));
	if (!(await file.exists())) return map;
	const rows = parseCsv(await file.text());
	const header = rows[0];
	if (!header) return map;
	const iId = headerIndex(header, "id");
	const iName = headerIndex(header, "name");
	for (let r = 1; r < rows.length; r++) {
		const row = rows[r];
		if (!row) continue;
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
	const file = Bun.file(path.join(dir, "food_portion.csv"));
	if (!(await file.exists())) return;
	const rows = parseCsv(await file.text());
	const header = rows[0];
	if (!header) return;
	const iFdc = headerIndex(header, "fdc_id");
	const iAmount = headerIndex(header, "amount");
	const iUnit = headerIndex(header, "measure_unit_id");
	const iMod = headerIndex(header, "modifier");
	const iGram = headerIndex(header, "gram_weight");
	const iDesc = header.includes("portion_description")
		? headerIndex(header, "portion_description")
		: -1;

	for (let r = 1; r < rows.length; r++) {
		const row = rows[r];
		if (!row) continue;
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
			row[iMod]?.trim() ||
			(iDesc >= 0 ? row[iDesc]?.trim() : "") ||
			null ||
			null;
		portions.push({
			fdcId,
			modifier: modifier || null,
			gramWeight,
			amount: amount != null && Number.isFinite(amount) ? amount : null,
			measureUnit: unitName,
		});
	}
}

function finalizeSalt(nutrients: Map<number, WideNutrients>): void {
	for (const wide of nutrients.values()) {
		if (wide.sodium_mg != null && Number.isFinite(wide.sodium_mg)) {
			wide.salt_g = (wide.sodium_mg * 2.5) / 1000;
		}
	}
}

function chunkArray<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}

async function generate(): Promise<string[]> {
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
	const nutrients = new Map<number, WideNutrients>();

	if (datasets.srLegacy) {
		console.log("Pivoting SR Legacy nutrients…");
		await loadNutrients(datasets.srLegacy, foodIds, nutrients);
	}
	if (datasets.foundation) {
		console.log("Pivoting Foundation nutrients…");
		await loadNutrients(datasets.foundation, foodIds, nutrients);
	}
	finalizeSalt(nutrients);

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
PRAGMA foreign_keys = OFF;
DELETE FROM food_portion;
DELETE FROM food_nutrient;
DELETE FROM food;
DELETE FROM food_fts;
PRAGMA foreign_keys = ON;
`,
	);
	written.push(clearPath);

	const FOOD_CHUNK = 200;
	const foodChunks = chunkArray(withMacros, FOOD_CHUNK);
	for (let i = 0; i < foodChunks.length; i++) {
		const chunk = foodChunks[i] ?? [];
		const lines: string[] = [
			`INSERT OR REPLACE INTO food (fdc_id, description, data_type) VALUES`,
		];
		lines.push(
			chunk
				.map(
					(f) =>
						`(${f.fdcId}, ${sqlString(f.description)}, ${sqlString(
							f.dataType === "foundation_food" ? "foundation" : "sr_legacy",
						)})`,
				)
				.join(",\n") + ";",
		);

		lines.push(
			`INSERT OR REPLACE INTO food_nutrient (fdc_id, energy_kcal, protein_g, fat_g, carb_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, salt_g) VALUES`,
		);
		lines.push(
			chunk
				.map((f) => {
					const n = nutrients.get(f.fdcId) ?? emptyNutrients();
					return `(${f.fdcId}, ${sqlNum(n.energy_kcal)}, ${sqlNum(n.protein_g)}, ${sqlNum(n.fat_g)}, ${sqlNum(n.carb_g)}, ${sqlNum(n.fiber_g)}, ${sqlNum(n.sugar_g)}, ${sqlNum(n.sat_fat_g)}, ${sqlNum(n.sodium_mg)}, ${sqlNum(n.salt_g)})`;
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
		const sql = [
			`INSERT INTO food_portion (fdc_id, modifier, gram_weight, amount, measure_unit) VALUES`,
			known
				.map(
					(p) =>
						`(${p.fdcId}, ${p.modifier ? sqlString(p.modifier) : "NULL"}, ${p.gramWeight}, ${sqlNum(p.amount)}, ${p.measureUnit ? sqlString(p.measureUnit) : "NULL"})`,
				)
				.join(",\n") + ";",
		].join("\n");
		const out = path.join(
			OUT_DIR,
			`02-portions-${String(i + 1).padStart(3, "0")}.sql`,
		);
		await writeFile(out, `${sql}\n`);
		written.push(out);
	}

	const ftsPath = path.join(OUT_DIR, "99-fts-rebuild.sql");
	await writeFile(
		ftsPath,
		`-- Rebuild FTS5 index from food.content
INSERT INTO food_fts(food_fts) VALUES('rebuild');
`,
	);
	written.push(ftsPath);

	const manifest = path.join(OUT_DIR, "MANIFEST.txt");
	await writeFile(
		manifest,
		[
			`generatedAt=${new Date().toISOString()}`,
			`foods=${withMacros.length}`,
			`portions=${portions.length}`,
			`files=${written.length}`,
			...written.map((f) => path.relative(ROOT, f)),
			"",
		].join("\n"),
	);

	console.log(
		`Wrote ${written.length} SQL files to ${path.relative(ROOT, OUT_DIR)}`,
	);
	return written;
}

async function applyFiles(
	files: string[],
	opts: { remote: boolean; db: string },
): Promise<void> {
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
Outputs: nutrition-db/generated/*.sql  (gitignored)
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
  # Production
  bun scripts/import-fdc-nutrition.ts --apply-remote

  # Or step-by-step:
  bunx wrangler d1 execute ration-nutrition --remote --file=nutrition-db/schema.sql
  for f in nutrition-db/generated/*.sql; do
    bunx wrangler d1 execute ration-nutrition --remote --file="$f"
  done
`);
}
