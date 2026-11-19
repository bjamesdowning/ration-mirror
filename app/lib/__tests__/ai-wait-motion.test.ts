import { describe, expect, it } from "vitest";
import {
	AI_WAIT_MOTION,
	aiWaitCreditLabel,
	aiWaitMotionMode,
	aiWaitMotionStyle,
	aiWaitStatusLabel,
} from "../ai-wait-motion";

describe("ai wait motion", () => {
	it("keeps one scan timing for every feature", () => {
		expect(AI_WAIT_MOTION).toEqual({
			sweepSeconds: 2.4,
			breatheSeconds: 1.8,
			orbitSeconds: 3.6,
			breatheScale: 1.06,
		});
		expect(aiWaitMotionStyle()).toEqual({
			"--ai-wait-sweep": "2.4s",
			"--ai-wait-breathe": "1.8s",
			"--ai-wait-orbit": "3.6s",
			"--ai-wait-breathe-scale": "1.06",
		});
	});

	it("holds a static ring when reduced motion is on", () => {
		expect(aiWaitMotionMode(false)).toBe("scan");
		expect(aiWaitMotionMode(true)).toBe("static");
	});

	it("announces the headline and the one line, not the animation", () => {
		expect(
			aiWaitStatusLabel("Analyzing", "This usually takes a few seconds."),
		).toBe("Analyzing. This usually takes a few seconds.");
		expect(
			aiWaitStatusLabel("Analyzing", "This usually takes a few seconds.", 2),
		).toBe("Analyzing. This usually takes a few seconds. Uses 2 credits.");
		expect(
			aiWaitStatusLabel("Analyzing photo…", "Identifying items."),
		).not.toContain("Not medical advice");
	});

	it("labels the credit pill without a per-use suffix", () => {
		expect(aiWaitCreditLabel(1)).toBe("Uses 1 credit");
		expect(aiWaitCreditLabel(2)).toBe("Uses 2 credits");
	});
});
