import { describe, expect, it } from "vitest";
import { RetryPurgeJobSchema, ToggleAdminSchema } from "../admin";

describe("ToggleAdminSchema", () => {
	it("accepts a toggle-admin intent", () => {
		expect(
			ToggleAdminSchema.parse({ intent: "toggle-admin", userId: "user_1" }),
		).toEqual({ intent: "toggle-admin", userId: "user_1" });
	});
});

describe("RetryPurgeJobSchema", () => {
	it("accepts a uuid job id and confirmation value", () => {
		const parsed = RetryPurgeJobSchema.parse({
			intent: "retry-purge-job",
			jobId: "11111111-1111-4111-8111-111111111111",
			confirmValue: "  bjamesdowning@gmail.com  ",
		});
		expect(parsed.confirmValue).toBe("bjamesdowning@gmail.com");
	});

	it("rejects a non-uuid job id", () => {
		expect(() =>
			RetryPurgeJobSchema.parse({
				intent: "retry-purge-job",
				jobId: "not-a-uuid",
				confirmValue: "a@b.com",
			}),
		).toThrow();
	});
});
