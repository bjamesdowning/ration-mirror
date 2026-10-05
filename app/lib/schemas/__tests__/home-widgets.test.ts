import { describe, expect, it } from "vitest";
import { HomeWidgetQuerySchema } from "../home-widgets";

describe("HomeWidgetQuerySchema", () => {
	it("accepts a real calendar day", () => {
		expect(HomeWidgetQuerySchema.parse({ date: "2026-10-05" }).date).toBe(
			"2026-10-05",
		);
	});

	it("rejects impossible and partial dates", () => {
		expect(
			HomeWidgetQuerySchema.safeParse({ date: "2026-02-30" }).success,
		).toBe(false);
		expect(
			HomeWidgetQuerySchema.safeParse({ date: "10/05/2026" }).success,
		).toBe(false);
		expect(HomeWidgetQuerySchema.safeParse({}).success).toBe(false);
	});
});
