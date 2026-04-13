import { describe, expect, it } from "vitest";
import {
	extractFinConnectorToken,
	isValidFinConnectorRequest,
	parseFinUserId,
} from "../fin-connector.server";

describe("fin connector auth", () => {
	it("extracts bearer token from Authorization header", () => {
		const headers = new Headers({
			Authorization: "Bearer test-token",
		});
		expect(extractFinConnectorToken(headers)).toBe("test-token");
	});

	it("extracts custom Intercom token header when Authorization absent", () => {
		const headers = new Headers({
			"x-intercom-token": "custom-token",
		});
		expect(extractFinConnectorToken(headers)).toBe("custom-token");
	});

	it("validates request token against configured secret", () => {
		const headers = new Headers({
			Authorization: "Bearer shared-secret",
		});
		expect(isValidFinConnectorRequest(headers, "shared-secret")).toBe(true);
		expect(isValidFinConnectorRequest(headers, "wrong-secret")).toBe(false);
	});
});

describe("parseFinUserId", () => {
	it("accepts opaque IDs without whitespace", () => {
		expect(parseFinUserId("user_abc-123")).toBe("user_abc-123");
	});

	it("rejects empty or whitespace IDs", () => {
		expect(parseFinUserId("")).toBeNull();
		expect(parseFinUserId("  ")).toBeNull();
		expect(parseFinUserId(null)).toBeNull();
	});

	it("rejects IDs that include spaces", () => {
		expect(parseFinUserId("user 123")).toBeNull();
	});
});
