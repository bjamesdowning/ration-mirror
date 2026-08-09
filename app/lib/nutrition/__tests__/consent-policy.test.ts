import { describe, expect, it } from "vitest";
import {
	listNutritionConsentStatements,
	NUTRITION_CONSENT_PURPOSES,
} from "../consent-policy";

describe("nutrition consent policy registry", () => {
	it("publishes one immutable, hashed statement per purpose", async () => {
		const statements = await listNutritionConsentStatements();
		expect(statements.map((statement) => statement.purpose)).toEqual(
			NUTRITION_CONSENT_PURPOSES,
		);
		for (const statement of statements) {
			expect(statement.text.length).toBeGreaterThan(300);
			expect(statement.sha256).toMatch(/^[a-f0-9]{64}$/);
			expect(statement.statementVersion).toContain(
				statement.purpose.replace("_", "-"),
			);
			expect(statement.privacyNoticeVersion).toBe("2026-08-09");
		}
	});

	it("hashes identical statement text deterministically", async () => {
		const first = await listNutritionConsentStatements();
		const second = await listNutritionConsentStatements();
		expect(first.map((statement) => statement.sha256)).toEqual(
			second.map((statement) => statement.sha256),
		);
	});
});
