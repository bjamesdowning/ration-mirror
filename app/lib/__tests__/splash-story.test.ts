import { describe, expect, it } from "vitest";
import {
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

	it("resolves loop stage indexes for scroll sync", () => {
		expect(loopStageIndex("cargo")).toBe(0);
		expect(loopStageIndex("dock")).toBe(4);
	});
});
