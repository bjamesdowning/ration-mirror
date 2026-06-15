import { describe, expect, it, vi } from "vitest";
import { hasOrgMembership } from "../org-membership.server";

const findFirst = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			member: { findFirst },
		},
	}),
}));

describe("hasOrgMembership", () => {
	it("returns true when a membership row exists", async () => {
		findFirst.mockResolvedValueOnce({ id: "member-1" });
		await expect(
			hasOrgMembership({} as D1Database, "user-1", "org-1"),
		).resolves.toBe(true);
	});

	it("returns false when no membership row exists", async () => {
		findFirst.mockResolvedValueOnce(undefined);
		await expect(
			hasOrgMembership({} as D1Database, "user-1", "org-1"),
		).resolves.toBe(false);
	});
});
