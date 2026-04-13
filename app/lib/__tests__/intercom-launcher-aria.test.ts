import { describe, expect, it } from "vitest";
import { intercomLauncherButtonAriaLabel } from "../intercom-launcher-aria";

describe("intercomLauncherButtonAriaLabel", () => {
	it("returns base label when there are no unread messages", () => {
		expect(intercomLauncherButtonAriaLabel(false)).toBe(
			"Ask Ration (support chat)",
		);
	});

	it("mentions unread messages when hasUnread is true", () => {
		expect(intercomLauncherButtonAriaLabel(true)).toBe(
			"Ask Ration (support chat), you have unread messages",
		);
	});
});
