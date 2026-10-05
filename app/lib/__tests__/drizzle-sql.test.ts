import { describe, expect, it } from "vitest";
import { compareMigrationNames, splitDrizzleStatements } from "../drizzle-sql";

describe("drizzle SQL helpers", () => {
	it("orders numbered files then breaks ties by name", () => {
		const files = [
			"0015_spooky_morg.sql",
			"0002_sweet_rawhide_kid.sql",
			"0015_monetization_tiers.sql",
			"0056_giant_karma.sql",
		];
		expect([...files].sort(compareMigrationNames)).toEqual([
			"0002_sweet_rawhide_kid.sql",
			"0015_monetization_tiers.sql",
			"0015_spooky_morg.sql",
			"0056_giant_karma.sql",
		]);
	});

	it("splits drizzle statement-breakpoint files", () => {
		expect(
			splitDrizzleStatements(
				"CREATE TABLE a (id text);\n--> statement-breakpoint\nCREATE INDEX a_idx ON a (id);\n",
			),
		).toEqual(["CREATE TABLE a (id text);", "CREATE INDEX a_idx ON a (id);"]);
	});
});
