import { describe, expect, it } from "vitest";
import { buildBakingReference } from "../MeasurementReference";

describe("buildBakingReference", () => {
	const rows = buildBakingReference();
	const row = (name: string) => rows.find((r) => r.ingredient === name);

	it("derives every row from the density table", () => {
		expect(rows).toHaveLength(22);
	});

	it("uses corrected densities", () => {
		expect(row("All-purpose flour")?.cup).toBe("125 g");
		expect(row("Bread flour")?.cup).toBe("121 g");
		expect(row("Powdered / icing sugar")?.cup).toBe("114 g");
		expect(row("Brown sugar (packed)")?.cup).toBe("213 g");
		expect(row("Coconut flour")?.cup).toBe("128 g");
		expect(row("Rolled oats")?.cup).toBe("90 g");
		expect(row("Butter")?.tbsp).toBe("14.2 g");
	});
});
