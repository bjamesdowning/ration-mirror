import { describe, expect, it } from "vitest";
import {
	DEFAULT_EXPIRATION_ALERT_DAYS,
	materializeUserPreferences,
} from "../tools/preferences";

describe("materializeUserPreferences", () => {
	it("fills expirationAlertDays when unset", () => {
		const out = materializeUserPreferences({ theme: "dark" });
		expect(out.expirationAlertDays).toBe(DEFAULT_EXPIRATION_ALERT_DAYS);
		expect(out.theme).toBe("dark");
	});

	it("preserves an explicit expirationAlertDays value including 0", () => {
		expect(
			materializeUserPreferences({ expirationAlertDays: 0 })
				.expirationAlertDays,
		).toBe(0);
		expect(
			materializeUserPreferences({ expirationAlertDays: 14 })
				.expirationAlertDays,
		).toBe(14);
	});
});
