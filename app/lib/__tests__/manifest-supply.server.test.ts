import { describe, expect, it } from "vitest";
import {
	isManifestDateIncludedInSupply,
	parseManifestSupplyDate,
	toggleManifestDaySupply,
} from "../manifest-supply.server";

describe("manifest-supply.server", () => {
	it("accepts valid YYYY-MM-DD dates", () => {
		expect(() => parseManifestSupplyDate("2026-07-04")).not.toThrow();
	});

	it("rejects invalid date format", async () => {
		const db = {} as D1Database;
		await expect(
			toggleManifestDaySupply(db, "org-1", "07/04/2026"),
		).rejects.toThrow(/YYYY-MM-DD/);
	});

	it("isManifestDateIncludedInSupply validates date format", async () => {
		const db = {} as D1Database;
		await expect(
			isManifestDateIncludedInSupply(db, "org-1", "bad-date"),
		).rejects.toThrow(/YYYY-MM-DD/);
	});
});
