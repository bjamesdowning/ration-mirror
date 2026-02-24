import { ITEM_DOMAINS } from "./domain";

export interface CsvParseResult {
	items: ParsedCsvItem[];
	warnings: string[];
	headerMapping: Record<string, string>;
}

export interface ParsedCsvItem {
	id?: string; // Optional UUID for round-trip upsert
	name: string;
	quantity: number;
	unit: string;
	domain?: string;
	tags?: string[];
	expiresAt?: string;
}

const KNOWN_UNITS = [
	"kg",
	"g",
	"lb",
	"oz",
	"l",
	"ml",
	"unit",
	"can",
	"pack",
] as const;

const COLUMN_ALIASES: Record<string, string> = {
	id: "id",
	// name aliases
	name: "name",
	item: "name",
	product: "name",
	ingredient: "name",
	// quantity aliases
	quantity: "quantity",
	qty: "quantity",
	amount: "quantity",
	count: "quantity",
	// unit aliases
	unit: "unit",
	uom: "unit",
	measure: "unit",
	// domain aliases
	domain: "domain",
	// tags aliases
	tags: "tags",
	tag: "tags",
	labels: "tags",
	// expiry aliases
	expires: "expiresAt",
	expiry: "expiresAt",
	expiration: "expiresAt",
	expires_at: "expiresAt",
	best_before: "expiresAt",
};

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function parseOptionalId(value?: string | null): string | undefined {
	if (!value || !value.trim()) return undefined;
	const trimmed = value.trim();
	return UUID_REGEX.test(trimmed) ? trimmed : undefined;
}

const MAX_ROWS = 500;

function normalizeHeader(value: string) {
	return value
		.replace(/^\uFEFF/, "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "_")
		.replace(/-+/g, "_");
}

function detectDelimiter(text: string) {
	const [firstLine] = text.split(/\r?\n/).filter((line) => line.trim());
	if (!firstLine) return ",";
	const commaCount = (firstLine.match(/,/g) || []).length;
	const tabCount = (firstLine.match(/\t/g) || []).length;
	if (tabCount > commaCount) return "\t";
	return ",";
}

function parseRecords(text: string, delimiter: string) {
	const rows: string[][] = [];
	let currentRow: string[] = [];
	let currentField = "";
	let inQuotes = false;

	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];
		const nextChar = text[i + 1];

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				currentField += '"';
				i += 1;
				continue;
			}
			inQuotes = !inQuotes;
			continue;
		}

		if (char === delimiter && !inQuotes) {
			currentRow.push(currentField);
			currentField = "";
			continue;
		}

		if ((char === "\n" || char === "\r") && !inQuotes) {
			if (char === "\r" && nextChar === "\n") {
				i += 1;
			}
			currentRow.push(currentField);
			if (currentRow.some((cell) => cell.trim().length > 0)) {
				rows.push(currentRow);
			}
			currentRow = [];
			currentField = "";
			continue;
		}

		currentField += char;
	}

	if (currentField.length > 0 || currentRow.length > 0) {
		currentRow.push(currentField);
		if (currentRow.some((cell) => cell.trim().length > 0)) {
			rows.push(currentRow);
		}
	}

	return rows;
}

function isHeaderRow(cells: string[]) {
	const mapped = cells
		.map((cell) => COLUMN_ALIASES[normalizeHeader(cell)])
		.filter(Boolean);
	if (mapped.length >= 2) return true;
	if (mapped.length >= 1 && cells.length <= 3) return true;
	return false;
}

function parseQuantity(value?: string | null) {
	if (!value || !value.trim()) return 1;
	const parsed = Number(value.replace(/,/g, "."));
	return Number.isFinite(parsed) ? parsed : NaN;
}

function parseTags(value?: string) {
	if (!value) return [];
	return value
		.split(/[;,]/)
		.map((tag) => tag.trim())
		.filter(Boolean);
}

function parseExpiresAt(value?: string) {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
	const date = new Date(`${trimmed}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return undefined;
	return trimmed;
}

export function parseInventoryCsv(csvText: string): CsvParseResult {
	const warnings: string[] = [];
	const headerMapping: Record<string, string> = {};
	const delimiter = detectDelimiter(csvText);
	const rows = parseRecords(csvText, delimiter);

	if (rows.length === 0) {
		return { items: [], warnings: ["No rows found in CSV"], headerMapping };
	}

	const headerRow = rows[0];
	const hasHeader = isHeaderRow(headerRow);
	const dataRows = hasHeader ? rows.slice(1) : rows;

	let columnTargets: Array<string | undefined> = [];
	if (hasHeader) {
		columnTargets = headerRow.map((cell) => {
			const normalized = normalizeHeader(cell);
			const mapped = COLUMN_ALIASES[normalized];
			if (mapped) headerMapping[cell] = mapped;
			return mapped;
		});
	} else {
		columnTargets = ["name", "quantity", "unit"];
		headerMapping.name = "name";
		headerMapping.quantity = "quantity";
		headerMapping.unit = "unit";
	}

	const items: ParsedCsvItem[] = [];

	for (let i = 0; i < dataRows.length; i += 1) {
		if (items.length >= MAX_ROWS) {
			warnings.push("Row limit exceeded. Only the first 500 items were kept.");
			break;
		}

		const row = dataRows[i];
		const rowNumber = hasHeader ? i + 2 : i + 1;
		const values: Record<string, string> = {};

		row.forEach((cell, index) => {
			const target = columnTargets[index];
			if (!target) return;
			values[target] = cell;
		});

		const name = values.name?.trim();
		if (!name) {
			warnings.push(`Row ${rowNumber}: missing item name`);
			continue;
		}

		const quantity = parseQuantity(values.quantity);
		if (!Number.isFinite(quantity) || quantity <= 0) {
			warnings.push(`Row ${rowNumber}: invalid quantity`);
			continue;
		}

		const unit = (values.unit || "unit").toLowerCase().trim();
		const normalizedUnit = KNOWN_UNITS.includes(
			unit as (typeof KNOWN_UNITS)[number],
		)
			? unit
			: "unit";

		const domain = (values.domain || "food").toLowerCase().trim();
		const normalizedDomain = (ITEM_DOMAINS as readonly string[]).includes(
			domain,
		)
			? domain
			: "food";

		const tags = parseTags(values.tags);
		const expiresAt = parseExpiresAt(values.expiresAt);
		if (values.expiresAt && !expiresAt) {
			warnings.push(`Row ${rowNumber}: invalid expiresAt date`);
		}

		const id = parseOptionalId(values.id);

		items.push({
			id,
			name,
			quantity,
			unit: normalizedUnit,
			domain: normalizedDomain,
			tags,
			expiresAt,
		});
	}

	return { items, warnings, headerMapping };
}
