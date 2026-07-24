import { describe, expect, it } from "vitest";
import {
	isPersonalOrganization,
	PERSONAL_GROUP_DELETE_MESSAGE,
	PERSONAL_GROUP_LEAVE_MESSAGE,
} from "~/lib/personal-group";

describe("isPersonalOrganization", () => {
	it("detects metadata.isPersonal", () => {
		expect(
			isPersonalOrganization({
				slug: "anything",
				metadata: { isPersonal: true },
			}),
		).toBe(true);
	});

	it("detects exact personal-<userId> slug", () => {
		expect(
			isPersonalOrganization({ slug: "personal-user_abc" }, "user_abc"),
		).toBe(true);
	});

	it("does not treat arbitrary personal-* slugs as personal", () => {
		expect(isPersonalOrganization({ slug: "personal-kitchen" })).toBe(false);
		expect(
			isPersonalOrganization({ slug: "personal-kitchen" }, "user_abc"),
		).toBe(false);
	});

	it("returns false for normal groups", () => {
		expect(
			isPersonalOrganization({
				slug: "family-kitchen",
				metadata: { isPersonal: false },
			}),
		).toBe(false);
	});

	it("exposes a clear block message", () => {
		expect(PERSONAL_GROUP_DELETE_MESSAGE).toMatch(/personal group/i);
	});
});

describe("PERSONAL_GROUP_LEAVE_MESSAGE", () => {
	it("exposes a clear leave block message", () => {
		expect(PERSONAL_GROUP_LEAVE_MESSAGE).toMatch(/personal group/i);
	});
});
