import { describe, expect, it } from "vitest";
import { CreateTagSchema } from "~/lib/schemas/tag";

describe("CreateTagSchema", () => {
	it("accepts name-only payloads for auto slug generation", () => {
		const parsed = CreateTagSchema.parse({ name: "Weeknight" });
		expect(parsed.name).toBe("Weeknight");
		expect(parsed.slug).toBeUndefined();
	});

	it("still accepts legacy slug-only payloads", () => {
		const parsed = CreateTagSchema.parse({ slug: "weeknight" });
		expect(parsed.slug).toBe("weeknight");
	});

	it("rejects empty payloads", () => {
		expect(() => CreateTagSchema.parse({})).toThrow();
	});
});
