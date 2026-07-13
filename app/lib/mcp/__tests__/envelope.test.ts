import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AGENT_CLAIM_REISSUE_PATH } from "../../agent/claim.constants";
import { CapacityExceededError } from "../../capacity.server";
import {
	decodeInventoryCursor,
	encodeInventoryCursor,
	mapErrorToEnvelope,
	zodValidationDetails,
} from "../envelope";

describe("inventory cursors", () => {
	it("round-trips expiresAt sort cursor", () => {
		const encoded = encodeInventoryCursor({
			sortBy: "expiresAt",
			expiresAt: "2026-07-13T00:00:00.000Z",
			id: "cargo-1",
		});
		expect(decodeInventoryCursor(encoded)).toEqual({
			sortBy: "expiresAt",
			expiresAt: "2026-07-13T00:00:00.000Z",
			id: "cargo-1",
		});
	});

	it("round-trips createdAt sort cursor", () => {
		const encoded = encodeInventoryCursor({
			sortBy: "createdAt",
			createdAt: "2026-01-01T00:00:00.000Z",
			id: "cargo-2",
		});
		expect(decodeInventoryCursor(encoded)).toEqual({
			sortBy: "createdAt",
			createdAt: "2026-01-01T00:00:00.000Z",
			id: "cargo-2",
		});
	});
});

describe("zodValidationDetails", () => {
	it("returns field keys with first message only", () => {
		const schema = z.object({
			name: z.string().min(1),
			quantity: z.number().positive(),
		});
		const result = schema.safeParse({ name: "", quantity: -1 });
		if (result.success) throw new Error("expected failure");

		const details = zodValidationDetails(result.error);
		expect(details).toEqual({
			name: expect.arrayContaining([expect.any(String)]),
			quantity: expect.arrayContaining([expect.any(String)]),
		});
		expect(Object.keys(details)).not.toContain("formErrors");
	});
});

describe("mapErrorToEnvelope", () => {
	it("returns trimmed validation details without full Zod flatten blob", () => {
		const schema = z.object({ query: z.string().min(3) });
		const result = schema.safeParse({ query: "ab" });
		if (result.success) throw new Error("expected failure");

		const envelope = mapErrorToEnvelope("search_ingredients", result.error);
		expect(envelope.ok).toBe(false);
		if (envelope.ok) return;

		expect(envelope.error.code).toBe("invalid_input");
		expect(envelope.error.message).toContain("query");
		expect(envelope.error.details).toEqual({
			query: [expect.any(String)],
		});
		expect(envelope.error.details).not.toHaveProperty("formErrors");
	});

	it("adds claim recovery paths on capacity_exceeded when preClaim", () => {
		const error = new CapacityExceededError({
			resource: "cargo",
			current: 35,
			limit: 35,
			tier: "free",
			isExpired: false,
			canAdd: 0,
		});

		const envelope = mapErrorToEnvelope("add_cargo_item", error, {
			preClaim: true,
			origin: "https://ration.mayutic.com",
		});

		expect(envelope.ok).toBe(false);
		if (envelope.ok) return;

		expect(envelope.error.code).toBe("capacity_exceeded");
		expect(envelope.error.details).toMatchObject({
			resource: "cargo",
			claimPage: "https://ration.mayutic.com/connect/claim",
			reissueClaimUri: `https://ration.mayutic.com${AGENT_CLAIM_REISSUE_PATH}`,
			claimRequiredForOwnership: true,
		});
	});

	it("omits claim recovery paths on capacity_exceeded when not preClaim", () => {
		const error = new CapacityExceededError({
			resource: "meals",
			current: 15,
			limit: 15,
			tier: "free",
			isExpired: false,
			canAdd: 0,
		});

		const envelope = mapErrorToEnvelope("create_meal", error, {
			preClaim: false,
			origin: "https://ration.mayutic.com",
		});

		expect(envelope.ok).toBe(false);
		if (envelope.ok) return;

		expect(envelope.error.details).not.toHaveProperty("claimPage");
		expect(envelope.error.details).not.toHaveProperty("reissueClaimUri");
	});
});
