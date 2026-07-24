import { describe, expect, it } from "vitest";
import {
	LEGAL_ENTITY,
	traderFooterLine,
	traderPostalAddressSchema,
} from "~/lib/legal-entity.constants";

describe("LEGAL_ENTITY", () => {
	it("uses Mayutic as registered business name with Irish jurisdiction", () => {
		expect(LEGAL_ENTITY.businessName).toBe("Mayutic");
		expect(LEGAL_ENTITY.registeredBusinessNameNumber).toBe("777497");
		expect(LEGAL_ENTITY.address.country).toBe("IE");
		expect(LEGAL_ENTITY.jurisdiction).toBe("Ireland");
		expect(LEGAL_ENTITY.formattedAddress).toBe("Ireland");
	});

	it("builds compact trader footer line without VAT when unregistered", () => {
		expect(traderFooterLine()).toBe("Mayutic · Ireland · RBN 777497");
	});

	it("exports postal address for schema.org without street or postal code", () => {
		expect(traderPostalAddressSchema()).toEqual({
			"@type": "PostalAddress",
			addressLocality: "Dublin",
			addressRegion: "Dublin",
			addressCountry: "IE",
			name: "Ireland",
		});
	});
});
