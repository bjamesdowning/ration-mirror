import { describe, expect, it } from "vitest";
import {
	RATION_INTERCOM_LAUNCHER_ID,
	RATION_INTERCOM_LAUNCHER_SELECTOR,
	withHubIntercomLauncher,
} from "../intercom-hub-settings";

describe("withHubIntercomLauncher", () => {
	it("adds hide_default_launcher and selector matching launcher id", () => {
		const boot = withHubIntercomLauncher({ app_id: "abc" });
		expect(boot).toEqual({
			app_id: "abc",
			hide_default_launcher: true,
			custom_launcher_selector: RATION_INTERCOM_LAUNCHER_SELECTOR,
		});
		expect(RATION_INTERCOM_LAUNCHER_SELECTOR).toBe(
			`#${RATION_INTERCOM_LAUNCHER_ID}`,
		);
	});

	it("preserves existing keys", () => {
		const boot = withHubIntercomLauncher({
			app_id: "x",
			user_id: "u1",
			custom_attributes: { ration_tier: "crew" },
		});
		expect(boot.user_id).toBe("u1");
		expect(boot.custom_attributes).toEqual({ ration_tier: "crew" });
		expect(boot.hide_default_launcher).toBe(true);
	});
});
