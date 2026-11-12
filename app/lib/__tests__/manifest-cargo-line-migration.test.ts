import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("manifest_cargo_line migration", () => {
	it("creates the table and its indexes and does not rewrite existing rows", () => {
		const sql = readFileSync(
			new URL("../../../drizzle/0065_tough_turbo.sql", import.meta.url),
			"utf8",
		);
		expect(sql).toContain("CREATE TABLE `manifest_cargo_line`");
		expect(sql).toContain(
			"CREATE INDEX `mcl_plan_date_idx` ON `manifest_cargo_line`",
		);
		expect(sql).toContain(
			"CREATE INDEX `mcl_plan_date_slot_idx` ON `manifest_cargo_line`",
		);
		const statements = sql
			.split("--> statement-breakpoint")
			.map((statement) => statement.trim())
			.filter((statement) => statement.length > 0);
		expect(statements.every((statement) => statement.startsWith("CREATE "))).toBe(
			true,
		);
	});
});
