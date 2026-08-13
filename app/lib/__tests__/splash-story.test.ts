import { describe, expect, it } from "vitest";
import {
	HERO_BEAT_MS,
	HERO_BEATS,
	LOOP_STAGES,
	loopStageIndex,
	stageShowsFuel,
} from "~/lib/splash-story";

describe("splash-story", () => {
	it("keeps a five-stage household loop", () => {
		expect(LOOP_STAGES.map((stage) => stage.id)).toEqual([
			"cargo",
			"galley",
			"manifest",
			"supply",
			"dock",
		]);
	});

	it("treats Daily Fuel as a private overlay on cook beats, not a sixth stage", () => {
		expect(stageShowsFuel("cargo")).toBe(false);
		expect(stageShowsFuel("galley")).toBe(false);
		expect(stageShowsFuel("supply")).toBe(false);
		expect(stageShowsFuel("manifest")).toBe(true);
		expect(stageShowsFuel("dock")).toBe(true);
	});

	it("sequences a 10–12s hero loop across kitchen then fuel", () => {
		expect(HERO_BEATS).toHaveLength(7);
		expect(HERO_BEATS[0]?.id).toBe("scan");
		expect(HERO_BEATS.at(-1)?.id).toBe("fuel");
		expect(HERO_BEATS.length * HERO_BEAT_MS).toBeGreaterThanOrEqual(10_000);
		expect(HERO_BEATS.length * HERO_BEAT_MS).toBeLessThanOrEqual(12_000);
	});

	it("resolves loop stage indexes for scroll sync", () => {
		expect(loopStageIndex("cargo")).toBe(0);
		expect(loopStageIndex("dock")).toBe(4);
	});
});
