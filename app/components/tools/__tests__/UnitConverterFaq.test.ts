import { describe, expect, it } from "vitest";
import { faqSchema } from "~/lib/structured-data";
import { UNIT_CONVERTER_FAQ } from "../UnitConverterFaq";

describe("unit converter FAQ", () => {
	it("builds FAQPage JSON-LD with all questions", () => {
		const schema = faqSchema(UNIT_CONVERTER_FAQ) as {
			"@type": string;
			mainEntity: unknown[];
		};
		expect(schema["@type"]).toBe("FAQPage");
		expect(schema.mainEntity).toHaveLength(8);
	});

	it("covers oz vs fl oz and uses the corrected powdered sugar figure", () => {
		const text = UNIT_CONVERTER_FAQ.map(
			(e) => `${e.question} ${e.answer}`,
		).join(" ");
		expect(text).toContain("oz and fl oz");
		expect(text).toContain("powdered sugar is around 114 g");
	});
});
