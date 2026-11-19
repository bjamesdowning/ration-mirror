import { describe, expect, it } from "vitest";
import { createSqliteD1 } from "../sqlite-d1";

describe("sqlite d1 raw rows", () => {
	it("keeps a later column when two selected names collide", async () => {
		const { database, sqlite } = createSqliteD1();
		sqlite.exec(`
			create table meal (id text, name text);
			create table organization (id text, name text);
			insert into meal values ('1', 'Soup');
			insert into organization values ('1', 'Galley');
		`);
		const rows = await database
			.prepare(
				`select meal.id, meal.name, organization.name, '[]' as tag_names
				 from meal left join organization on meal.id = organization.id`,
			)
			.raw();
		expect(rows).toEqual([["1", null, "Galley", "[]"]]);
	});
});
