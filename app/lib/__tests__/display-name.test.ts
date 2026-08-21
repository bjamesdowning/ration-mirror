import { describe, expect, it } from "vitest";
import { getUserDisplayName, resolveCreatedUserName } from "~/lib/display-name";

describe("getUserDisplayName", () => {
	it("returns the trimmed name when available", () => {
		expect(
			getUserDisplayName({
				name: "  Billy Downing  ",
				email: "billy@example.com",
			}),
		).toBe("Billy Downing");
	});

	it("falls back to email when name is missing", () => {
		expect(
			getUserDisplayName({
				name: "",
				email: "crew.member@example.com",
			}),
		).toBe("crew.member@example.com");
	});

	it("returns Unknown when both name and email are missing", () => {
		expect(getUserDisplayName({ name: "  ", email: "" })).toBe("Unknown");
	});
});

describe("resolveCreatedUserName", () => {
	it("keeps a trimmed display name", () => {
		expect(
			resolveCreatedUserName({
				name: "  Billy  ",
				email: "billy@example.com",
			}),
		).toBe("Billy");
	});

	it("uses the email local-part when Apple sends an empty name", () => {
		expect(
			resolveCreatedUserName({
				name: "",
				email: "downing@mayutic.com",
			}),
		).toBe("downing");
	});
});
