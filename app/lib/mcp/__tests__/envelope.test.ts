import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mapErrorToEnvelope, zodValidationDetails } from "../envelope";

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
});
