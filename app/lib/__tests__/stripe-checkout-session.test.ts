import { describe, expect, it } from "vitest";
import { buildEmbeddedCheckoutSessionBase } from "~/lib/stripe.server";

describe("buildEmbeddedCheckoutSessionBase", () => {
	it("requires billing address collection for EU B2C VAT compliance", () => {
		const base = buildEmbeddedCheckoutSessionBase("cus_test123");
		expect(base.ui_mode).toBe("embedded");
		expect(base.customer).toBe("cus_test123");
		expect(base.billing_address_collection).toBe("required");
		expect(base.customer_update).toEqual({ address: "auto" });
	});
});
