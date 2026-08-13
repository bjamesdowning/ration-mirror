import { describe, expect, it } from "vitest";
import {
	CREDIT_FORFEIT_ACKNOWLEDGE_LABEL,
	CREDIT_FORFEIT_ERROR_MESSAGE,
	CREDIT_FORFEIT_UNACKNOWLEDGED,
	CreditForfeitUnacknowledgedError,
	creditForfeitAckRequired,
	groupDeleteCreditConsequence,
	groupDeleteCreditFooter,
	groupDeleteCreditWarning,
	parseAcknowledgeCreditForfeit,
	requiresCreditForfeitAck,
} from "../group-delete-credits";

describe("creditForfeitAckRequired", () => {
	it("is required only when credits are positive and ack is missing", () => {
		expect(creditForfeitAckRequired(680, false)).toBe(true);
		expect(creditForfeitAckRequired(1, false)).toBe(true);
		expect(creditForfeitAckRequired(680, true)).toBe(false);
		expect(creditForfeitAckRequired(0, false)).toBe(false);
		expect(creditForfeitAckRequired(0, true)).toBe(false);
		expect(creditForfeitAckRequired(-1, false)).toBe(false);
	});
});

describe("requiresCreditForfeitAck", () => {
	it("is true only for a positive balance", () => {
		expect(requiresCreditForfeitAck(1)).toBe(true);
		expect(requiresCreditForfeitAck(0)).toBe(false);
	});
});

describe("group delete credit copy", () => {
	it("names the count and non-refundable forfeiture", () => {
		expect(groupDeleteCreditConsequence(680)).toBe(
			"680 remaining credits (permanently deleted, not refunded)",
		);
		expect(groupDeleteCreditWarning(680, true)).toContain("680 credits");
		expect(groupDeleteCreditWarning(680, true)).toContain("not refunded");
		expect(groupDeleteCreditWarning(680, true)).toContain("Transfer them");
		expect(groupDeleteCreditWarning(12, false)).not.toContain("Transfer them");
		expect(groupDeleteCreditWarning(12, false)).toContain("not refunded");
		expect(groupDeleteCreditFooter(42)).toContain("42 credits");
		expect(CREDIT_FORFEIT_ACKNOWLEDGE_LABEL).toContain("not refunded");
	});
});

describe("parseAcknowledgeCreditForfeit", () => {
	it("accepts common truthy form values", () => {
		expect(parseAcknowledgeCreditForfeit("true")).toBe(true);
		expect(parseAcknowledgeCreditForfeit("1")).toBe(true);
		expect(parseAcknowledgeCreditForfeit("on")).toBe(true);
	});

	it("rejects missing or falsey values", () => {
		expect(parseAcknowledgeCreditForfeit(null)).toBe(false);
		expect(parseAcknowledgeCreditForfeit(undefined)).toBe(false);
		expect(parseAcknowledgeCreditForfeit("false")).toBe(false);
		expect(parseAcknowledgeCreditForfeit("")).toBe(false);
	});
});

describe("CreditForfeitUnacknowledgedError", () => {
	it("carries the balance and stable machine code", () => {
		const error = new CreditForfeitUnacknowledgedError(680);
		expect(error.code).toBe(CREDIT_FORFEIT_UNACKNOWLEDGED);
		expect(error.status).toBe(400);
		expect(error.credits).toBe(680);
		expect(error.message).toBe(CREDIT_FORFEIT_ERROR_MESSAGE);
	});
});
