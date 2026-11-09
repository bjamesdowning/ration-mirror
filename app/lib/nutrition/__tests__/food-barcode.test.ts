import { describe, expect, it, vi } from "vitest";
import { lookupSupplyBarcode } from "~/lib/supply-barcode.server";
import { matchBrandedGtin, normalizeGtin } from "../food-barcode";
import { lookupFoodBarcode } from "../food-barcode.server";

vi.mock("~/lib/supply-barcode.server", () => ({
	lookupSupplyBarcode: vi.fn(),
}));

const CODE = "012345678905";
const MATCHING_GTIN = "00012345678905";

function branded(gtinUpc: string, description = "Brand Yogurt") {
	return {
		fdcId: 55,
		description,
		dataType: "Branded",
		gtinUpc,
		foodNutrients: [
			{ nutrientId: 1008, value: 90 },
			{ nutrientId: 1003, value: 9 },
			{ nutrientId: 1004, value: 2 },
			{ nutrientId: 1005, value: 11 },
			{ nutrientId: 1079, value: 0 },
		],
	};
}

function usdaFetch(
	foods: unknown[],
	off: "product" | "down",
	calls: { usda: number; off: number },
): typeof fetch {
	return (async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.includes("openfoodfacts")) {
			calls.off += 1;
			if (off === "down") throw new Error("open food facts down");
			return new Response(
				JSON.stringify({ product: { product_name: "Off Product" } }),
				{ status: 200 },
			);
		}
		calls.usda += 1;
		return new Response(JSON.stringify({ foods }), { status: 200 });
	}) as typeof fetch;
}

describe("branded barcode match", () => {
	it("strips leading zeros and rejects a zero code", () => {
		expect(normalizeGtin("00012345678905")).toBe("12345678905");
		expect(matchBrandedGtin("000", []).found).toBe(false);
	});

	it("misses a branded text hit whose gtinUpc does not match", () => {
		const miss = matchBrandedGtin(CODE, [
			{
				fdcId: 9,
				description: "Brand Yogurt",
				dataType: "Branded",
				gtinUpc: "999",
				energyKcal: 90,
				proteinG: 9,
				carbsG: 11,
				fatG: 2,
			},
		]);
		expect(miss).toEqual({
			found: false,
			next: "custom_add",
			barcode: "12345678905",
		});
	});

	it("accepts an exact gtinUpc after stripping zeros", () => {
		const hit = matchBrandedGtin(CODE, [
			{
				fdcId: 55,
				description: "Brand Yogurt",
				dataType: "Branded",
				gtinUpc: MATCHING_GTIN,
				energyKcal: 90,
				proteinG: 9,
				carbsG: 11,
				fatG: 2,
				fiberG: 0,
			},
		]);
		expect(hit.found).toBe(true);
		if (hit.found) {
			expect(hit.source).toBe("usda_branded");
			expect(hit.macros?.energyKcal).toBe(90);
		}
	});

	it("does not call Open Food Facts when that product would be returned", async () => {
		const calls = { usda: 0, off: 0 };
		const hit = await lookupFoodBarcode(
			{ USDA_FDC_API_KEY: "test-key" } as Env,
			CODE,
			usdaFetch([branded(MATCHING_GTIN)], "product", calls),
		);
		expect(calls.off).toBe(0);
		expect(calls.usda).toBe(1);
		expect(hit.found).toBe(true);
		expect(lookupSupplyBarcode).not.toHaveBeenCalled();
	});

	it("does not call Open Food Facts when that host is down", async () => {
		const calls = { usda: 0, off: 0 };
		const miss = await lookupFoodBarcode(
			{ USDA_FDC_API_KEY: "test-key" } as Env,
			CODE,
			usdaFetch([branded("999")], "down", calls),
		);
		expect(calls.off).toBe(0);
		expect(calls.usda).toBe(1);
		expect(miss).toMatchObject({ found: false, next: "custom_add" });
		expect(lookupSupplyBarcode).not.toHaveBeenCalled();
	});

	it("does not retry a miss", async () => {
		const calls = { usda: 0, off: 0 };
		await lookupFoodBarcode(
			{ USDA_FDC_API_KEY: "test-key" } as Env,
			CODE,
			usdaFetch([], "product", calls),
		);
		expect(calls.usda).toBe(1);
	});
});
