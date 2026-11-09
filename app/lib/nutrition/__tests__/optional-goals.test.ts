import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getCopilotSystemPrompt } from "~/lib/copilot/system-prompt.server";
import { IOS_FEATURE_FLOOR } from "~/lib/feature-flags/flags.server";
import {
	OPTIONAL_GOALS_AGENT_RULE,
	OPTIONAL_GOALS_DRAFT_COPY,
	OPTIONAL_GOALS_NOT_MEDICAL,
	optionalGoalsStepVisible,
	optionalGoalWrite,
} from "../optional-goals";

const empty = {
	dailyEnergyKcal: "",
	proteinG: "",
	carbsG: "",
	fatG: "",
	fiberG: "",
};

describe("optional goals step", () => {
	it("stays hidden until Macro Tracking is on and a nutrition flag allows it", () => {
		expect(IOS_FEATURE_FLOOR).toBe("1.5.0");
		expect(
			optionalGoalsStepVisible({
				macroTrackingOn: false,
				fastLogEnabled: true,
				goalsEnabled: true,
				clientPlatform: "web",
			}),
		).toBe(false);
		expect(
			optionalGoalsStepVisible({
				macroTrackingOn: true,
				fastLogEnabled: false,
				goalsEnabled: false,
				clientPlatform: "web",
			}),
		).toBe(false);
		expect(
			optionalGoalsStepVisible({
				macroTrackingOn: true,
				fastLogEnabled: true,
				goalsEnabled: false,
				clientPlatform: "web",
			}),
		).toBe(true);
		expect(
			optionalGoalsStepVisible({
				macroTrackingOn: true,
				fastLogEnabled: false,
				goalsEnabled: true,
				clientPlatform: "web",
			}),
		).toBe(true);
	});

	it("fails closed for iOS below 1.6 even when the goals flag is on", () => {
		expect(
			optionalGoalsStepVisible({
				macroTrackingOn: true,
				fastLogEnabled: true,
				goalsEnabled: true,
				clientPlatform: "ios",
				clientVersion: "1.5.21",
			}),
		).toBe(false);
		expect(
			optionalGoalsStepVisible({
				macroTrackingOn: true,
				fastLogEnabled: false,
				goalsEnabled: true,
				clientPlatform: "ios",
				clientVersion: "1.6.0",
			}),
		).toBe(true);
	});

	it("skip and an empty form write nothing, and a stated number is stored as typed", () => {
		expect(optionalGoalWrite(empty, true)).toBeNull();
		expect(optionalGoalWrite({ ...empty, proteinG: "90" }, false)).toBeNull();
		expect(optionalGoalWrite({ ...empty, proteinG: "90" }, true)).toEqual({
			dailyEnergyKcal: null,
			proteinG: 90,
			carbsG: null,
			fatG: null,
			fiberG: null,
		});
		expect(OPTIONAL_GOALS_DRAFT_COPY).toBe("Enter targets you already use");
		expect(OPTIONAL_GOALS_NOT_MEDICAL).toBe(
			"Not medical advice. Goals and totals are planning aids only.",
		);
		expect(OPTIONAL_GOALS_DRAFT_COPY).not.toMatch(/\d/);
	});

	it("does not suggest a target in the agent documentation", () => {
		const tool = readFileSync(
			new URL("../../mcp/tools/nutrition.ts", import.meta.url),
			"utf8",
		);
		const prompt = readFileSync(
			new URL("../../mcp/resources.ts", import.meta.url),
			"utf8",
		);
		const system = getCopilotSystemPrompt();
		expect(tool).toContain(OPTIONAL_GOALS_AGENT_RULE);
		expect(prompt).toContain(
			"set_nutrition_goal only when the user states numbers",
		);
		expect(system).toContain(
			"Never prescribe targets; set_nutrition_goal only when the user states numbers.",
		);
		for (const text of [tool, prompt, system, OPTIONAL_GOALS_AGENT_RULE]) {
			expect(text).not.toMatch(/suggest(?:ed)? (?:a |calorie |kcal )?target/i);
			expect(text).not.toMatch(/\b(?:try|recommend|typical|around)\s+\d+/i);
		}
	});
});
