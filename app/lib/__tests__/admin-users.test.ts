import { describe, expect, it } from "vitest";
import {
	ADMIN_USER_HYDRATION_MAX_IDS,
	computeLastActiveMs,
	computeLastLoginMs,
	DEFAULT_ADMIN_USERS_LIMIT,
	DEFAULT_ADMIN_USERS_ORDER,
	DEFAULT_ADMIN_USERS_SORT,
	resolvePlatform,
} from "../admin-users";
import {
	adminUserHydrationIds,
	assertBoundedAdminUserIds,
	buildUserSearchFilter,
	hydrateAdminUserRows,
	mergeLoggedInUsers,
} from "../admin-users.server";

describe("mergeLoggedInUsers", () => {
	const webRows = [
		{
			userId: "u1",
			name: "Alice",
			email: "alice@test.com",
			sessionCount: 2,
			lastSeenAt: new Date("2026-07-03T12:00:00Z"),
		},
		{
			userId: "u2",
			name: "Bob",
			email: "bob@test.com",
			sessionCount: 1,
			lastSeenAt: new Date("2026-07-03T10:00:00Z"),
		},
	];

	const mobileRows = [
		{
			userId: "u1",
			name: "Alice",
			email: "alice@test.com",
			lastSeenAt: new Date("2026-07-03T11:00:00Z"),
		},
		{
			userId: "u3",
			name: "Carol",
			email: "carol@test.com",
			lastSeenAt: new Date("2026-07-03T13:00:00Z"),
		},
	];

	it("merges web and mobile users, deduplicating by userId", () => {
		const result = mergeLoggedInUsers(webRows, mobileRows, 15);
		expect(result).toHaveLength(3);
		expect(result.map((u) => u.id).sort()).toEqual(["u1", "u2", "u3"]);
	});

	it("sorts by most recent lastSeenAt descending", () => {
		const result = mergeLoggedInUsers(webRows, mobileRows, 15);
		expect(result[0].id).toBe("u3");
		expect(result[1].id).toBe("u1");
		expect(result[2].id).toBe("u2");
	});

	it("marks platform as both when user has web and mobile sessions", () => {
		const result = mergeLoggedInUsers(webRows, mobileRows, 15);
		const alice = result.find((u) => u.id === "u1");
		expect(alice?.platform).toBe("both");
		expect(alice?.sessionCount).toBe(2);
	});

	it("marks mobile-only users correctly", () => {
		const result = mergeLoggedInUsers(webRows, mobileRows, 15);
		const carol = result.find((u) => u.id === "u3");
		expect(carol?.platform).toBe("mobile");
		expect(carol?.sessionCount).toBe(0);
	});

	it("respects the limit parameter", () => {
		const result = mergeLoggedInUsers(webRows, mobileRows, 2);
		expect(result).toHaveLength(2);
	});

	it("deduplicates users for total count when limit is unbounded", () => {
		const result = mergeLoggedInUsers(
			webRows,
			mobileRows,
			Number.MAX_SAFE_INTEGER,
		);
		expect(result).toHaveLength(3);
	});

	it("accepts D1 unix-second lastSeenAt values (not Date objects)", () => {
		const d1WebRows = [
			{
				userId: "u1",
				name: "Alice",
				email: "alice@test.com",
				sessionCount: 1,
				lastSeenAt: 1_783_120_821,
			},
		];
		const d1MobileRows = [
			{
				userId: "u2",
				name: "Bob",
				email: "bob@test.com",
				lastSeenAt: 1_783_035_447,
			},
		];
		expect(() => mergeLoggedInUsers(d1WebRows, d1MobileRows, 15)).not.toThrow();
		const result = mergeLoggedInUsers(d1WebRows, d1MobileRows, 15);
		expect(result[0].id).toBe("u1");
		expect(result[0].lastSeenAt).toEqual(new Date(1_783_120_821_000));
	});

	it("accepts ISO string lastSeenAt from loader serialization", () => {
		const result = mergeLoggedInUsers(
			[
				{
					userId: "u1",
					name: "Alice",
					email: "alice@test.com",
					sessionCount: 1,
					lastSeenAt: "2026-07-03T12:00:00.000Z",
				},
			],
			[],
			15,
		);
		expect(result[0].lastSeenAt).toEqual(new Date("2026-07-03T12:00:00.000Z"));
	});
});

describe("resolvePlatform", () => {
	it("returns both when web and mobile", () => {
		expect(resolvePlatform(true, true)).toBe("both");
	});
	it("returns mobile when mobile only", () => {
		expect(resolvePlatform(false, true)).toBe("mobile");
	});
	it("returns web when web only", () => {
		expect(resolvePlatform(true, false)).toBe("web");
	});
});

describe("computeLastLoginMs", () => {
	it("returns the greater of session and mobile timestamps", () => {
		expect(computeLastLoginMs(1000, 2000)).toBe(2000);
		expect(computeLastLoginMs(3000, 2000)).toBe(3000);
	});
	it("handles zero values", () => {
		expect(computeLastLoginMs(0, 500)).toBe(500);
		expect(computeLastLoginMs(0, 0)).toBe(0);
	});
});

describe("computeLastActiveMs", () => {
	it("returns the greatest activity timestamp across sources", () => {
		expect(computeLastActiveMs(1000, 2000, 500)).toBe(2000);
		expect(computeLastActiveMs(3000, 2000, 2500)).toBe(3000);
	});
	it("handles zero values", () => {
		expect(computeLastActiveMs(0, 0, 0)).toBe(0);
		expect(computeLastActiveMs(0, 500, 0)).toBe(500);
	});
});

describe("buildUserSearchFilter", () => {
	it("returns undefined for empty or whitespace query", () => {
		expect(buildUserSearchFilter()).toBeUndefined();
		expect(buildUserSearchFilter("")).toBeUndefined();
		expect(buildUserSearchFilter("   ")).toBeUndefined();
	});

	it("returns a filter for non-empty query", () => {
		expect(buildUserSearchFilter("alice")).toBeDefined();
	});
});

describe("admin user list defaults", () => {
	it("uses createdAt desc with page size 25", () => {
		expect(DEFAULT_ADMIN_USERS_SORT).toBe("createdAt");
		expect(DEFAULT_ADMIN_USERS_ORDER).toBe("desc");
		expect(DEFAULT_ADMIN_USERS_LIMIT).toBe(25);
	});
});

describe("adminUserHydrationIds", () => {
	it("returns null for an empty page so wave 2 is skipped", () => {
		expect(adminUserHydrationIds([])).toBeNull();
	});

	it("returns the same ids when within the hydration cap", () => {
		const ids = ["u1", "u2", "u3"];
		expect(adminUserHydrationIds(ids)).toEqual(ids);
	});

	it("accepts the schema max page size", () => {
		const ids = Array.from(
			{ length: ADMIN_USER_HYDRATION_MAX_IDS },
			(_, i) => `u${i}`,
		);
		expect(adminUserHydrationIds(ids)).toHaveLength(
			ADMIN_USER_HYDRATION_MAX_IDS,
		);
	});

	it("refuses unbounded id lists", () => {
		const ids = Array.from(
			{ length: ADMIN_USER_HYDRATION_MAX_IDS + 1 },
			(_, i) => `u${i}`,
		);
		expect(() => adminUserHydrationIds(ids)).toThrow(
			/refused 101 ids \(max 100\)/,
		);
		expect(() => assertBoundedAdminUserIds(ids)).toThrow(
			/refused 101 ids \(max 100\)/,
		);
	});
});

describe("hydrateAdminUserRows", () => {
	const pageRows = [
		{
			id: "u1",
			name: "Alice",
			email: "alice@test.com",
			isAdmin: true,
			createdAt: new Date("2026-01-01T00:00:00Z"),
			settings: { lastActiveAt: "2026-07-03T12:00:00.000Z" },
		},
		{
			id: "u2",
			name: "Bob",
			email: "bob@test.com",
			isAdmin: false,
			createdAt: new Date("2026-02-01T00:00:00Z"),
			settings: null,
		},
	];

	it("merges session, mobile, api-key, and settings activity", () => {
		const result = hydrateAdminUserRows(
			pageRows,
			[
				{
					userId: "u1",
					maxLogin: 1_783_120_000,
					maxActive: 1_700_000_000,
				},
			],
			[{ userId: "u1", maxLogin: 1_783_121_000 }],
			[{ userId: "u2", maxActive: 1_783_122_000 }],
		);

		expect(result).toHaveLength(2);
		expect(result[0].lastLoginAt).toEqual(new Date(1_783_121_000_000));
		expect(result[0].lastActiveAt).toEqual(
			new Date("2026-07-03T12:00:00.000Z"),
		);
		expect(result[1].lastLoginAt).toBeNull();
		expect(result[1].lastActiveAt).toEqual(new Date(1_783_122_000_000));
		expect(result[0].isAdmin).toBe(true);
		expect(result[1].name).toBe("Bob");
	});

	it("returns null activity dates when no aggregates exist", () => {
		const result = hydrateAdminUserRows(
			[
				{
					id: "u3",
					name: "Carol",
					email: "carol@test.com",
					isAdmin: false,
					createdAt: null,
					settings: {},
				},
			],
			[],
			[],
			[],
		);
		expect(result[0].lastLoginAt).toBeNull();
		expect(result[0].lastActiveAt).toBeNull();
	});

	it("returns an empty list for an empty page", () => {
		expect(hydrateAdminUserRows([], [], [], [])).toEqual([]);
	});
});
