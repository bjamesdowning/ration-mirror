/** Flag `copilot-confirm-scope`: carry-forward, word forms, prompt, metric helper. */
import { describe, expect, it } from "vitest";
import {
	COPILOT_WRITE_CARRY_FORWARD_MS,
	INVENTORY_WRITE,
	liveCarryForwardDomains,
	MANIFEST_WRITE,
	nextCarryForwardEntries,
	resolveCopilotActiveTools,
} from "../active-tools.server";
import { detectConfirmWithoutApply } from "../deflection.server";
import { getCopilotSystemPrompt } from "../system-prompt.server";

const ALL = [
	"search_docs",
	"get_context",
	"list_inventory",
	"preview_inventory_remove",
	"apply_inventory_remove",
	"preview_inventory_import",
	"apply_inventory_import",
	"remove_cargo_item",
	"propose_manifest_plan",
	"commit_manifest_plan",
	"list_meals",
];

describe("nextCarryForwardEntries / liveCarryForwardDomains", () => {
	const now = 1_000_000;

	it("opens inventory for 15 minutes after a successful preview", () => {
		const next = nextCarryForwardEntries(
			[],
			"preview_inventory_remove",
			true,
			now,
		);
		expect(next).toEqual([
			{ domain: "inventory", expiresAt: now + COPILOT_WRITE_CARRY_FORWARD_MS },
		]);
		expect(liveCarryForwardDomains(next, now + 1)).toEqual(["inventory"]);
		expect(
			liveCarryForwardDomains(next, now + COPILOT_WRITE_CARRY_FORWARD_MS),
		).toEqual([]);
	});

	it("does not open on a failed preview", () => {
		expect(
			nextCarryForwardEntries([], "preview_inventory_remove", false, now),
		).toEqual([]);
	});

	it("closes the domain after a successful apply", () => {
		const open = nextCarryForwardEntries(
			[],
			"preview_inventory_import",
			true,
			now,
		);
		expect(
			nextCarryForwardEntries(open, "apply_inventory_import", true, now + 5),
		).toEqual([]);
	});

	it("keeps the domain open when apply fails", () => {
		const open = nextCarryForwardEntries(
			[],
			"preview_inventory_remove",
			true,
			now,
		);
		expect(
			nextCarryForwardEntries(open, "apply_inventory_remove", false, now + 5),
		).toEqual(open);
	});

	it("tracks manifest separately and drops expired entries", () => {
		const inv = nextCarryForwardEntries(
			[],
			"preview_inventory_remove",
			true,
			now,
		);
		const later = now + COPILOT_WRITE_CARRY_FORWARD_MS + 1;
		const both = nextCarryForwardEntries(
			inv,
			"propose_manifest_plan",
			true,
			later,
		);
		expect(both).toEqual([
			{
				domain: "manifest",
				expiresAt: later + COPILOT_WRITE_CARRY_FORWARD_MS,
			},
		]);
		expect(liveCarryForwardDomains(undefined, now)).toEqual([]);
	});
});

describe("resolveCopilotActiveTools with carry-forward", () => {
	it("'yes' after a preview: no apply without carry-forward (old behaviour)", () => {
		expect(resolveCopilotActiveTools(ALL, "yes")).not.toContain(
			"apply_inventory_remove",
		);
	});

	it("'yes' with inventory carry-forward includes both apply tools", () => {
		const active = resolveCopilotActiveTools(ALL, "yes", {
			carryForward: ["inventory"],
		});
		expect(active).toContain("apply_inventory_remove");
		expect(active).toContain("apply_inventory_import");
	});

	it("'go ahead' with manifest carry-forward includes commit_manifest_plan", () => {
		const active = resolveCopilotActiveTools(ALL, "go ahead", {
			carryForward: ["manifest"],
		});
		expect(active).toContain("commit_manifest_plan");
		expect(active).not.toContain("apply_inventory_remove");
	});

	it("empty text with carry-forward still re-opens the domain", () => {
		expect(
			resolveCopilotActiveTools(ALL, "  ", { carryForward: ["inventory"] }),
		).toContain("apply_inventory_remove");
		expect(resolveCopilotActiveTools(ALL, "  ")).not.toContain(
			"apply_inventory_remove",
		);
	});

	it("never returns a tool outside `available`", () => {
		const available = ["search_docs", "get_context", "list_inventory"];
		const active = resolveCopilotActiveTools(available, "yes, bin them", {
			carryForward: ["inventory", "manifest"],
			wordForms: true,
		});
		for (const name of active) expect(available).toContain(name);
		for (const name of [...INVENTORY_WRITE, ...MANIFEST_WRITE]) {
			if (!available.includes(name)) expect(active).not.toContain(name);
		}
	});

	it.each([
		"removing the old milk",
		"removal of everything expired",
		"bin the yoghurt",
		"toss the bread",
		"throw them out",
		"throw away the lettuce",
		"get rid of the spinach",
		"clear out the fridge",
		"discard the eggs",
		"deleting those",
	])("word form %j opens inventory writes only with the flag", (text) => {
		expect(resolveCopilotActiveTools(ALL, text, { wordForms: true })).toContain(
			"apply_inventory_remove",
		);
	});

	it.each(["bin the yoghurt", "toss the bread", "get rid of the spinach"])(
		"word form %j stays closed with the flag off",
		(text) => {
			expect(resolveCopilotActiveTools(ALL, text)).not.toContain(
				"apply_inventory_remove",
			);
		},
	);
});

describe("getCopilotSystemPrompt confirmScope", () => {
	it("flag off is unchanged from the default call", () => {
		expect(getCopilotSystemPrompt(undefined, { confirmScope: false })).toBe(
			getCopilotSystemPrompt(),
		);
	});

	it("flag on asks for preview and apply in the same turn", () => {
		const on = getCopilotSystemPrompt(undefined, { confirmScope: true });
		expect(on).not.toBe(getCopilotSystemPrompt());
		expect(on).toMatch(/same turn/i);
		expect(on).toMatch(/Approve/);
	});
});

describe("detectConfirmWithoutApply", () => {
	it("flags a short reply with a live domain and no tool call", () => {
		expect(
			detectConfirmWithoutApply({
				carriedDomains: ["inventory"],
				toolCallCount: 0,
				userText: "yes",
			}),
		).toBe(true);
	});

	it("ignores turns with a tool call, no domain, or long text", () => {
		expect(
			detectConfirmWithoutApply({
				carriedDomains: ["inventory"],
				toolCallCount: 1,
				userText: "yes",
			}),
		).toBe(false);
		expect(
			detectConfirmWithoutApply({
				carriedDomains: [],
				toolCallCount: 0,
				userText: "yes",
			}),
		).toBe(false);
		expect(
			detectConfirmWithoutApply({
				carriedDomains: ["manifest"],
				toolCallCount: 0,
				userText: "x".repeat(41),
			}),
		).toBe(false);
	});
});
