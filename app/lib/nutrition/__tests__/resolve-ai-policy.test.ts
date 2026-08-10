import { describe, expect, it } from "vitest";
import { allowAiEstimateForResolveIngestSource } from "../resolve-ai-policy";

describe("allowAiEstimateForResolveIngestSource", () => {
	it("enables AI only for scan_review", () => {
		expect(allowAiEstimateForResolveIngestSource("scan_review")).toBe(true);
	});

	it("keeps AI off when ingestSource is omitted", () => {
		expect(allowAiEstimateForResolveIngestSource(undefined)).toBe(false);
	});
});
