import { describe, expect, it } from "vitest";
import { OrganizationProfilePatchSchema } from "~/lib/schemas/org-profile";

describe("OrganizationProfilePatchSchema", () => {
	it("accepts trimmed names within bounds", () => {
		const result = OrganizationProfilePatchSchema.parse({
			name: "  Home Kitchen  ",
		});
		expect(result.name).toBe("Home Kitchen");
	});

	it("rejects empty names", () => {
		expect(() =>
			OrganizationProfilePatchSchema.parse({ name: "   " }),
		).toThrow();
	});

	it("rejects names over 100 characters", () => {
		expect(() =>
			OrganizationProfilePatchSchema.parse({ name: "a".repeat(101) }),
		).toThrow();
	});
});
