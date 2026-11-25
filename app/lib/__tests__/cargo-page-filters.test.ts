import { beforeEach, describe, expect, it } from "vitest";
import { getCargoPage } from "~/lib/cargo.server";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

const ORG = "org-a";
const OTHER_ORG = "org-b";

const SCHEMA = `
	create table cargo (
		id text primary key not null,
		organization_id text not null,
		name text not null,
		quantity real not null,
		unit text not null,
		base_quantity real default 1 not null,
		base_unit text default 'unit' not null,
		domain text default 'food' not null,
		status text default 'stable' not null,
		expires_at integer,
		created_at integer not null,
		updated_at integer not null,
		nutrition text
	);
	create table tag (
		id text primary key not null,
		organization_id text not null,
		slug text not null,
		name text not null,
		color text,
		category text,
		created_by text,
		created_at integer not null default 0
	);
	create table cargo_tag (
		cargo_id text not null,
		tag_id text not null,
		primary key (cargo_id, tag_id)
	);
`;

function seed(sqlite: ReturnType<typeof createSqliteD1>["sqlite"]) {
	sqlite.exec(SCHEMA);
	const cargo = sqlite.prepare(
		"insert into cargo (id, organization_id, name, quantity, unit, domain, expires_at, created_at, updated_at) values (?, ?, ?, 1, 'unit', ?, ?, ?, ?)",
	);
	cargo.run("c-milk", ORG, "Whole Milk", "food", 1_800_000_000, 50, 50);
	cargo.run("c-oat", ORG, "Oat milk", "food", null, 40, 40);
	cargo.run("c-cheddar", ORG, "Cheddar", "food", 1_900_000_000, 30, 30);
	cargo.run("c-soap", ORG, "Dish soap", "household", null, 20, 20);
	cargo.run("c-other", OTHER_ORG, "Milk", "food", null, 10, 10);
	const tag = sqlite.prepare(
		"insert into tag (id, organization_id, slug, name) values (?, ?, ?, ?)",
	);
	tag.run("t-dairy", ORG, "dairy", "Dairy");
	tag.run("t-dairy-other", OTHER_ORG, "dairy", "Dairy");
	const link = sqlite.prepare(
		"insert into cargo_tag (cargo_id, tag_id) values (?, ?)",
	);
	link.run("c-milk", "t-dairy");
	link.run("c-cheddar", "t-dairy");
	// A cross-org link must never leak into ORG's page.
	link.run("c-other", "t-dairy-other");
}

describe("getCargoPage filters (#19)", () => {
	let db: D1Database;

	beforeEach(() => {
		const created = createSqliteD1();
		seed(created.sqlite);
		db = created.database;
	});

	const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);

	it("returns every row when no filter is set", async () => {
		const page = await getCargoPage(db, ORG, { limit: 10 });
		expect(ids(page.items)).toEqual(["c-milk", "c-oat", "c-cheddar", "c-soap"]);
	});

	it("matches nameContains case-insensitively", async () => {
		const page = await getCargoPage(db, ORG, {
			limit: 10,
			nameContains: "  MILK ",
		});
		expect(ids(page.items)).toEqual(["c-milk", "c-oat"]);
	});

	it("treats LIKE wildcards in nameContains as text", async () => {
		const page = await getCargoPage(db, ORG, { limit: 10, nameContains: "%" });
		expect(page.items).toEqual([]);
	});

	it("treats _ in nameContains as text, not a single-character wildcard", async () => {
		const page = await getCargoPage(db, ORG, { limit: 10, nameContains: "_" });
		expect(page.items).toEqual([]);
		const exact = await getCargoPage(db, ORG, {
			limit: 10,
			nameContains: "dish soap",
		});
		expect(ids(exact.items)).toEqual(["c-soap"]);
		const underscored = await getCargoPage(db, ORG, {
			limit: 10,
			nameContains: "dish_soap",
		});
		expect(underscored.items).toEqual([]);
	});

	it("filters by tag slug within the kitchen only", async () => {
		const page = await getCargoPage(db, ORG, { limit: 10, tag: "Dairy" });
		expect(ids(page.items)).toEqual(["c-milk", "c-cheddar"]);
	});

	it("returns nothing for an unknown tag", async () => {
		const page = await getCargoPage(db, ORG, { limit: 10, tag: "frozen" });
		expect(page.items).toEqual([]);
	});

	it("combines filters with domain, sort, and the cursor", async () => {
		const first = await getCargoPage(db, ORG, {
			limit: 1,
			domain: "food",
			tag: "dairy",
			nameContains: "e",
			sortBy: "expiresAt",
		});
		expect(ids(first.items)).toEqual(["c-milk"]);
		expect(first.nextCursor).not.toBeNull();
		const second = await getCargoPage(db, ORG, {
			limit: 1,
			domain: "food",
			tag: "dairy",
			nameContains: "e",
			sortBy: "expiresAt",
			cursor: first.nextCursor,
		});
		expect(ids(second.items)).toEqual(["c-cheddar"]);
		expect(second.nextCursor).toBeNull();
	});

	it("returns expiresAt as a Date for the MCP projection to serialise", async () => {
		const page = await getCargoPage(db, ORG, {
			limit: 10,
			nameContains: "whole",
		});
		expect(page.items[0]?.expiresAt).toBeInstanceOf(Date);
	});
});
