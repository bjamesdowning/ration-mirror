import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fuel tag migration", () => {
	it("adds tag_names and does not update or delete rows", () => {
		const sql = readFileSync("drizzle/0066_fuel_log_tags.sql", "utf8");
		expect(sql).toContain("ALTER TABLE `nutrition_intake` ADD `tag_names`");
		expect(sql.toUpperCase().includes("UPDATE")).toBe(false);
		expect(sql.toUpperCase().includes("DELETE")).toBe(false);
	});
});
