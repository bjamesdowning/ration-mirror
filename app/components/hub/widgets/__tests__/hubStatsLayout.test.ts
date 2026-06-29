import { describe, expect, it } from "vitest";
import { getHubStatsGridClass } from "../hubStatsLayout";

describe("getHubStatsGridClass", () => {
	it("uses a fixed 2-column grid for sm without 5-column layout", () => {
		const classes = getHubStatsGridClass("sm");
		expect(classes).toContain("grid-cols-2");
		expect(classes).not.toContain("grid-cols-5");
		expect(classes).not.toContain("lg:grid-cols-5");
	});

	it("uses an intermediate grid for md", () => {
		const classes = getHubStatsGridClass("md");
		expect(classes).toContain("grid-cols-2");
		expect(classes).toContain("sm:grid-cols-3");
		expect(classes).not.toContain("lg:grid-cols-5");
	});

	it("preserves full-width 5-column layout for lg", () => {
		const classes = getHubStatsGridClass("lg");
		expect(classes).toContain("lg:grid-cols-5");
		expect(classes).toContain("md:grid-cols-3");
	});
});
