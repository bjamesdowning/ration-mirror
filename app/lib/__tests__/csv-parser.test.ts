import { describe, expect, it } from "vitest";
import { parseInventoryCsv } from "~/lib/csv-parser";

describe("parseInventoryCsv — delimiter detection", () => {
	it("parses comma-delimited CSV", () => {
		const csv = "name,quantity,unit\napple,2,kg";
		const { items, warnings } = parseInventoryCsv(csv);
		expect(items).toHaveLength(1);
		expect(items[0].name).toBe("apple");
		expect(items[0].quantity).toBe(2);
		expect(items[0].unit).toBe("kg");
		expect(warnings).toHaveLength(0);
	});

	it("parses tab-delimited CSV", () => {
		const csv = "name\tquantity\tunit\napple\t3\tg";
		const { items } = parseInventoryCsv(csv);
		expect(items).toHaveLength(1);
		expect(items[0].quantity).toBe(3);
		expect(items[0].unit).toBe("g");
	});
});

describe("parseInventoryCsv — quoted fields", () => {
	it("handles quoted fields containing commas", () => {
		const csv = 'name,quantity,unit\n"salt, sea",1,g';
		const { items } = parseInventoryCsv(csv);
		expect(items[0].name).toBe("salt, sea");
	});

	it("handles escaped quotes inside quoted fields", () => {
		const csv = 'name,quantity,unit\n"he said ""hello""",1,unit';
		const { items } = parseInventoryCsv(csv);
		expect(items[0].name).toBe('he said "hello"');
	});
});

describe("parseInventoryCsv — header alias resolution", () => {
	it("resolves 'item' column alias to 'name'", () => {
		const csv = "item,qty,unit\nrice,500,g";
		const { items, headerMapping } = parseInventoryCsv(csv);
		expect(items[0].name).toBe("rice");
		expect(headerMapping.item).toBe("name");
		expect(headerMapping.qty).toBe("quantity");
	});

	it("resolves 'product' column alias", () => {
		const csv = "product,amount,uom\nflour,1,kg";
		const { items } = parseInventoryCsv(csv);
		expect(items[0].name).toBe("flour");
		expect(items[0].quantity).toBe(1);
	});

	it("resolves expiry column aliases", () => {
		const csv = "name,quantity,unit,best_before\napple,1,unit,2025-12-31";
		const { items } = parseInventoryCsv(csv);
		expect(items[0].expiresAt).toBe("2025-12-31");
	});
});

describe("parseInventoryCsv — row validation", () => {
	it("skips rows with missing name and adds warning", () => {
		const csv = "name,quantity,unit\n,2,kg\napple,1,unit";
		const { items, warnings } = parseInventoryCsv(csv);
		expect(items).toHaveLength(1);
		expect(warnings.some((w) => w.includes("missing item name"))).toBe(true);
	});

	it("skips rows with invalid quantity and adds warning", () => {
		const csv = "name,quantity,unit\napple,notanumber,kg\nbanana,2,unit";
		const { items, warnings } = parseInventoryCsv(csv);
		expect(items).toHaveLength(1);
		expect(warnings.some((w) => w.includes("invalid quantity"))).toBe(true);
	});

	it("skips rows with zero quantity and adds warning", () => {
		const csv = "name,quantity,unit\napple,0,kg";
		const { items, warnings } = parseInventoryCsv(csv);
		expect(items).toHaveLength(0);
		expect(warnings.some((w) => w.includes("invalid quantity"))).toBe(true);
	});
});

describe("parseInventoryCsv — MAX_ROWS enforcement", () => {
	it("limits output to 500 rows and adds a warning", () => {
		const header = "name,quantity,unit\n";
		const rows = Array.from({ length: 501 }, (_, i) => `item${i},1,g`).join(
			"\n",
		);
		const { items, warnings } = parseInventoryCsv(header + rows);
		expect(items).toHaveLength(500);
		expect(warnings.some((w) => w.includes("Row limit exceeded"))).toBe(true);
	});
});

describe("parseInventoryCsv — unit normalisation", () => {
	it("normalises known units to lowercase", () => {
		const csv = "name,quantity,unit\napple,1,KG";
		const { items } = parseInventoryCsv(csv);
		expect(items[0].unit).toBe("kg");
	});

	it("falls back to 'unit' for unknown units", () => {
		const csv = "name,quantity,unit\napple,1,stone";
		const { items } = parseInventoryCsv(csv);
		expect(items[0].unit).toBe("unit");
	});

	it("defaults to 'unit' when unit column is missing", () => {
		const csv = "name,quantity\napple,1";
		const { items } = parseInventoryCsv(csv);
		expect(items[0].unit).toBe("unit");
	});
});

describe("parseInventoryCsv — domain parsing", () => {
	it("accepts valid domain values", () => {
		const csv = "name,quantity,unit,domain\napple,1,kg,food";
		const { items } = parseInventoryCsv(csv);
		expect(items[0].domain).toBe("food");
	});

	it("falls back to food for unknown domain", () => {
		const csv = "name,quantity,unit,domain\napple,1,kg,alien_food";
		const { items } = parseInventoryCsv(csv);
		expect(items[0].domain).toBe("food");
	});
});

describe("parseInventoryCsv — tag splitting", () => {
	it("splits comma-separated tags in the tags column cell", () => {
		// When tags are comma-separated within a single quoted cell, they split correctly
		const csv = 'name,quantity,unit,tags\napple,1,kg,"organic,fresh"';
		const { items } = parseInventoryCsv(csv);
		expect(items[0].tags).toEqual(["organic", "fresh"]);
	});

	it("splits semicolon-separated tags", () => {
		const csv = "name,quantity,unit,tags\napple,1,kg,organic;local";
		const { items } = parseInventoryCsv(csv);
		expect(items[0].tags).toEqual(["organic", "local"]);
	});
});

describe("parseInventoryCsv — BOM handling", () => {
	it("strips BOM from first header cell", () => {
		const csv = "\uFEFFname,quantity,unit\napple,2,g";
		const { items } = parseInventoryCsv(csv);
		expect(items).toHaveLength(1);
		expect(items[0].name).toBe("apple");
	});
});

describe("parseInventoryCsv — expiry date validation", () => {
	it("accepts valid ISO date", () => {
		const csv = "name,quantity,unit,expiry\napple,1,kg,2025-12-31";
		const { items } = parseInventoryCsv(csv);
		expect(items[0].expiresAt).toBe("2025-12-31");
	});

	it("rejects non-ISO date format and adds warning", () => {
		const csv = "name,quantity,unit,expiry\napple,1,kg,31/12/2025";
		const { items, warnings } = parseInventoryCsv(csv);
		expect(items[0].expiresAt).toBeUndefined();
		expect(warnings.some((w) => w.includes("invalid expiresAt"))).toBe(true);
	});
});

describe("parseInventoryCsv — empty input", () => {
	it("returns empty items with warning for empty CSV", () => {
		const { items, warnings } = parseInventoryCsv("");
		expect(items).toHaveLength(0);
		expect(warnings.some((w) => w.includes("No rows found"))).toBe(true);
	});
});
