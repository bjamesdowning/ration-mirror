import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MobileHubResponseSchema } from "~/lib/schemas/mobile/hub";

const fixturePath = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../../__fixtures__/mobile/hub-populated.json",
);

describe("mobile Hub populated wire contract", () => {
	it("accepts the shared golden Hub fixture", () => {
		const payload = JSON.parse(readFileSync(fixturePath, "utf8"));
		const result = MobileHubResponseSchema.safeParse(payload);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.mealMatches).toHaveLength(1);
		expect(result.data.snackMatches).toHaveLength(1);
		expect(result.data.nutritionToday?.days[0]?.entryCount).toBe(1);
		expect(result.data.hubLayout?.widgets[0]?.order).toBe(0);
	});

	it("rejects the golden fixture when an Int-backed field becomes fractional", () => {
		const payload = JSON.parse(readFileSync(fixturePath, "utf8"));
		payload.mealMatches[0].meal.servings = 1.4;
		expect(MobileHubResponseSchema.safeParse(payload).success).toBe(false);
	});
});
