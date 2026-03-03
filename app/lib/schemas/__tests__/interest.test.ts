import { describe, expect, it } from "vitest";
import { InterestSignupSchema } from "~/lib/schemas/interest";

describe("InterestSignupSchema", () => {
	it("accepts a valid email", () => {
		const result = InterestSignupSchema.safeParse({
			email: "user@example.com",
		});
		expect(result.success).toBe(true);
	});

	it("accepts email with optional source", () => {
		const result = InterestSignupSchema.safeParse({
			email: "user@example.com",
			source: "home",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.source).toBe("home");
		}
	});

	it("rejects invalid email", () => {
		const result = InterestSignupSchema.safeParse({ email: "not-an-email" });
		expect(result.success).toBe(false);
	});

	it("rejects empty email", () => {
		const result = InterestSignupSchema.safeParse({ email: "" });
		expect(result.success).toBe(false);
	});

	it("rejects source longer than 50 characters", () => {
		const result = InterestSignupSchema.safeParse({
			email: "user@example.com",
			source: "a".repeat(51),
		});
		expect(result.success).toBe(false);
	});
});
