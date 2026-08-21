import { describe, expect, it } from "vitest";
import { copilotInferenceErrorContext } from "../inference-error";

describe("copilotInferenceErrorContext", () => {
	it("prefers responseBody when APICallError.message is empty", () => {
		const error = Object.assign(new Error(""), {
			name: "AI_APICallError",
			statusCode: 402,
			url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:streamGenerateContent",
			responseBody:
				'{"error":"Insufficient balance; add money to your gateway or use BYOK"}',
		});

		expect(copilotInferenceErrorContext(error)).toEqual({
			errorName: "AI_APICallError",
			statusCode: 402,
			url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:streamGenerateContent",
			responseBody:
				'{"error":"Insufficient balance; add money to your gateway or use BYOK"}',
		});
	});

	it("truncates long response bodies", () => {
		const error = Object.assign(new Error("bad request"), {
			responseBody: "x".repeat(500),
		});

		const context = copilotInferenceErrorContext(error);
		expect(context.errorMessage).toBe("bad request");
		expect(String(context.responseBody)).toHaveLength(400);
	});

	it("stringifies non-objects", () => {
		expect(copilotInferenceErrorContext("boom")).toEqual({
			errorDetail: "boom",
		});
	});
});
