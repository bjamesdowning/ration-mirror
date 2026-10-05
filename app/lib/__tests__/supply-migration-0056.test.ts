import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

const migrationSql = readFileSync(
	join(process.cwd(), "drizzle/0056_giant_karma.sql"),
	"utf8",
);

describe("0056 supply library migration", () => {
	it("adds supply_item.updated_at with a constant default", () => {
		expect(migrationSql).toContain(
			"ALTER TABLE `supply_item` ADD `updated_at` integer DEFAULT 0 NOT NULL",
		);
		expect(migrationSql).not.toMatch(
			/ALTER TABLE `supply_item` ADD `updated_at`[^;]*unixepoch/i,
		);
	});

	it("promotes one existing list per kitchen to live before the unique index", () => {
		const updateAt = migrationSql.indexOf("UPDATE `supply_list`");
		const indexAt = migrationSql.indexOf("supply_list_one_live_per_org");
		expect(updateAt).toBeGreaterThan(0);
		expect(indexAt).toBeGreaterThan(updateAt);
		expect(migrationSql).toContain("SET `kind` = 'live'");
		expect(migrationSql).toContain("WHEN `name` = 'Supply'");
	});

	it("keeps the newest Supply list live when a kitchen has duplicates", async () => {
		const { database, sqlite } = createSqliteD1();
		sqlite.exec(`
CREATE TABLE supply_list (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'saved',
  updated_at INTEGER NOT NULL
);
`);
		const insert = sqlite.prepare(
			"INSERT INTO supply_list (id, organization_id, name, kind, updated_at) VALUES (?, ?, ?, 'saved', ?)",
		);
		insert.run("old-supply", "org-1", "Supply", 10);
		insert.run("new-supply", "org-1", "Supply", 20);
		insert.run("other", "org-1", "Costco", 30);
		insert.run("only", "org-2", "Groceries", 5);

		const update = migrationSql
			.split("--> statement-breakpoint")
			.map((part) => part.trim())
			.find((part) => part.startsWith("UPDATE `supply_list`"));
		expect(update).toBeTruthy();
		await database.prepare(update ?? "").run();

		const rows = sqlite
			.prepare("SELECT id, kind FROM supply_list ORDER BY organization_id, id")
			.all() as Array<{ id: string; kind: string }>;
		expect(rows).toEqual([
			{ id: "new-supply", kind: "live" },
			{ id: "old-supply", kind: "saved" },
			{ id: "other", kind: "saved" },
			{ id: "only", kind: "live" },
		]);
	});
});
