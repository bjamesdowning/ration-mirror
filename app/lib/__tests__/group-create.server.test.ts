import { describe, expect, it, vi } from "vitest";
import { resolveOrganizationCreateSlug } from "~/lib/group-create.server";
import { resolveGroupSlugFromName } from "~/lib/slugify";

vi.mock("~/lib/slugify", async (importOriginal) => {
	const actual = await importOriginal<typeof import("~/lib/slugify")>();
	return {
		...actual,
		resolveGroupSlugFromName: vi.fn(actual.resolveGroupSlugFromName),
	};
});

describe("resolveOrganizationCreateSlug", () => {
	it("returns explicit slug when provided", async () => {
		const slug = await resolveOrganizationCreateSlug(
			{} as D1Database,
			"Kitchen",
			"my-kitchen",
		);
		expect(slug).toBe("my-kitchen");
		expect(resolveGroupSlugFromName).not.toHaveBeenCalled();
	});

	it("derives slug from name when omitted", async () => {
		vi.mocked(resolveGroupSlugFromName).mockResolvedValueOnce("kitchen");

		const slug = await resolveOrganizationCreateSlug(
			{} as D1Database,
			"Kitchen",
		);
		expect(slug).toBe("kitchen");
		expect(resolveGroupSlugFromName).toHaveBeenCalled();
	});
});
