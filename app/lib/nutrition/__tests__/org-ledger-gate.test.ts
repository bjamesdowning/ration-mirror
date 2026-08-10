import { describe, expect, it } from "vitest";
import { classifyOrgLedgerDecision } from "../org-ledger-gate";

describe("classifyOrgLedgerDecision", () => {
	it("treats resolutionKind miss as hard miss", () => {
		expect(
			classifyOrgLedgerDecision(
				{
					resolutionKind: "miss",
					fdcId: null,
					decisionSource: "automatic",
					matchQuality: null,
				},
				false,
			),
		).toBe("miss");
	});

	it("ignores poisoned review + null fdcId (does not miss)", () => {
		expect(
			classifyOrgLedgerDecision(
				{
					resolutionKind: "review",
					fdcId: null,
					decisionSource: "automatic",
					matchQuality: "medium",
				},
				false,
			),
		).toBe("ignore");
		expect(
			classifyOrgLedgerDecision(
				{
					resolutionKind: "review",
					fdcId: null,
					decisionSource: "automatic",
					matchQuality: "low",
				},
				true,
			),
		).toBe("ignore");
	});

	it("attaches high and user/barcode decisions", () => {
		expect(
			classifyOrgLedgerDecision(
				{
					resolutionKind: "hit",
					fdcId: 1097510,
					decisionSource: "automatic",
					matchQuality: "high",
				},
				true,
			),
		).toBe("attach");
		expect(
			classifyOrgLedgerDecision(
				{
					resolutionKind: "hit",
					fdcId: 1,
					decisionSource: "user",
					matchQuality: "verified",
				},
				true,
			),
		).toBe("attach");
	});

	it("attaches medium when requireAutoAccept is false", () => {
		expect(
			classifyOrgLedgerDecision(
				{
					resolutionKind: "review",
					fdcId: 1097510,
					decisionSource: "automatic",
					matchQuality: "medium",
				},
				false,
			),
		).toBe("attach");
	});

	it("abstains on medium when requireAutoAccept is true", () => {
		expect(
			classifyOrgLedgerDecision(
				{
					resolutionKind: "review",
					fdcId: 1097510,
					decisionSource: "automatic",
					matchQuality: "medium",
				},
				true,
			),
		).toBe("abstain");
	});
});
