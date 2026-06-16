import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));
vi.mock("../vector.server", () => ({
	deleteCargoVectors: vi.fn(),
}));

import {
	AGENT_ORPHAN_INACTIVITY_MS,
	CLAIM_TOKEN_SLIDE_MS,
} from "../agent/claim.constants";
import { isOrphanEligible } from "../agent/orphan-cleanup.server";

describe("isOrphanEligible", () => {
	const now = new Date("2026-06-01T00:00:00Z");
	const idleCutoff = new Date(now.getTime() - AGENT_ORPHAN_INACTIVITY_MS - 1);

	it("returns false for claimed registrations", () => {
		expect(
			isOrphanEligible({
				status: "claimed",
				preClaim: false,
				createdAt: idleCutoff,
				lastUsedAt: null,
				now,
			}),
		).toBe(false);
	});

	it("returns false when preClaim is false", () => {
		expect(
			isOrphanEligible({
				status: "pending_claim",
				preClaim: false,
				createdAt: idleCutoff,
				lastUsedAt: null,
				now,
			}),
		).toBe(false);
	});

	it("returns true when pending_claim, preClaim, and lastUsedAt is older than cutoff", () => {
		expect(
			isOrphanEligible({
				status: "pending_claim",
				preClaim: true,
				createdAt: new Date("2025-01-01"),
				lastUsedAt: idleCutoff,
				now,
			}),
		).toBe(true);
	});

	it("uses createdAt when lastUsedAt is null", () => {
		expect(
			isOrphanEligible({
				status: "pending_claim",
				preClaim: true,
				createdAt: idleCutoff,
				lastUsedAt: null,
				now,
			}),
		).toBe(true);
	});

	it("returns false when recently active", () => {
		const recent = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		expect(
			isOrphanEligible({
				status: "pending_claim",
				preClaim: true,
				createdAt: idleCutoff,
				lastUsedAt: recent,
				now,
			}),
		).toBe(false);
	});
});

describe("claim time constants", () => {
	it("CLAIM_TOKEN_SLIDE_MS equals AGENT_ORPHAN_INACTIVITY_MS", () => {
		expect(CLAIM_TOKEN_SLIDE_MS).toBe(AGENT_ORPHAN_INACTIVITY_MS);
		expect(CLAIM_TOKEN_SLIDE_MS).toBe(180 * 24 * 60 * 60 * 1000);
	});
});
