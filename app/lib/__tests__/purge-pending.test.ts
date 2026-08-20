import { describe, expect, it } from "vitest";
import {
	matchesPurgeRetryConfirmation,
	type PurgeJobRecord,
} from "../purge-pending.server";

function job(overrides: Partial<PurgeJobRecord>): PurgeJobRecord {
	return {
		id: "11111111-1111-4111-8111-111111111111",
		kind: "account",
		status: "failed",
		attemptCount: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("matchesPurgeRetryConfirmation", () => {
	it("matches account jobs by email case-insensitively", () => {
		const account = job({
			email: "bjamesdowning@gmail.com",
			userId: "user-1",
		});
		expect(
			matchesPurgeRetryConfirmation(account, "  BJAMESDOWNING@gmail.com "),
		).toBe(true);
		expect(matchesPurgeRetryConfirmation(account, "other@gmail.com")).toBe(
			false,
		);
	});

	it("matches group jobs by exact organization id", () => {
		const group = job({
			kind: "group",
			organizationId: "org-abc",
		});
		expect(matchesPurgeRetryConfirmation(group, "org-abc")).toBe(true);
		expect(matchesPurgeRetryConfirmation(group, "org-xyz")).toBe(false);
	});
});
