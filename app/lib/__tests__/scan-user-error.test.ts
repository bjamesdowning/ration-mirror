import { describe, expect, it } from "vitest";
import {
	isTechnicalErrorMessage,
	SCAN_USER_ERROR,
	toUserFacingScanError,
} from "~/lib/scan-user-error";

describe("isTechnicalErrorMessage", () => {
	it("detects JSON SyntaxError-style messages", () => {
		expect(
			isTechnicalErrorMessage(
				"Expected ':' after property name in JSON at position 3390 (line 1 column 3391)",
			),
		).toBe(true);
	});

	it("allows customer-facing copy", () => {
		expect(isTechnicalErrorMessage(SCAN_USER_ERROR.parse)).toBe(false);
		expect(isTechnicalErrorMessage(SCAN_USER_ERROR.generic)).toBe(false);
	});
});

describe("toUserFacingScanError", () => {
	it("maps the reported JSON parse error to receipt copy", () => {
		expect(
			toUserFacingScanError(
				"Expected ':' after property name in JSON at position 3390 (line 1 column 3391)",
			),
		).toBe(SCAN_USER_ERROR.parse);
	});

	it("maps Error instances with technical messages", () => {
		expect(
			toUserFacingScanError(
				new SyntaxError("Unexpected token } in JSON at position 12"),
			),
		).toBe(SCAN_USER_ERROR.parse);
	});

	it("maps unknown Errors to generic copy (no leak)", () => {
		expect(toUserFacingScanError(new Error("internal stack dump"))).toBe(
			SCAN_USER_ERROR.generic,
		);
	});

	it("passes through curated customer messages", () => {
		expect(toUserFacingScanError(SCAN_USER_ERROR.schema)).toBe(
			SCAN_USER_ERROR.schema,
		);
	});
});
