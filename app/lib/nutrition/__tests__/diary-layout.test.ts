import { describe, expect, it, vi } from "vitest";
import type { McpToolContext } from "~/lib/mcp/auth";
import type { McpToolsEnv } from "~/lib/mcp/tool-runtime";
import { createDiaryToolDefs } from "~/lib/mcp/tools/diary";
import { materializeUserPreferences } from "~/lib/mcp/tools/preferences";
import { createMockEnv } from "~/test/helpers/mock-env";
import {
	applyDiaryLayout,
	diaryLayoutControlVisible,
	normalizeDiaryLayout,
	presentDiaryRows,
} from "../diary-layout";

const patchUserSettings = vi.fn();
const getUserSettings = vi.fn();

vi.mock("~/lib/auth.server", () => ({
	patchUserSettings: (...args: unknown[]) => patchUserSettings(...args),
	getUserSettings: (...args: unknown[]) => getUserSettings(...args),
}));

describe("diary layout", () => {
	it("defaults to timeline and hides the control when the flag is off", () => {
		expect(normalizeDiaryLayout(undefined)).toBe("timeline");
		expect(normalizeDiaryLayout("slots")).toBe("slots");
		expect(normalizeDiaryLayout("grid")).toBe("timeline");
		expect(diaryLayoutControlVisible(false)).toBe(false);
		expect(diaryLayoutControlVisible(true)).toBe(true);
		expect(materializeUserPreferences({ theme: "dark" }).diaryLayout).toBe(
			"timeline",
		);
	});

	it("keeps a null slot in Other, still ordered by time then id", () => {
		const rows = [
			{ id: "late", occurredAt: "2026-11-09T18:00:00.000Z", slotType: null },
			{
				id: "b",
				occurredAt: "2026-11-09T08:00:00.000Z",
				slotType: "breakfast",
			},
			{
				id: "early-b",
				occurredAt: "2026-11-09T12:00:00.000Z",
				slotType: null,
			},
			{
				id: "same-a",
				occurredAt: "2026-11-09T12:00:00.000Z",
				slotType: "other",
			},
			{
				id: "lunch",
				occurredAt: "2026-11-09T13:00:00.000Z",
				slotType: "lunch",
			},
		];
		const groups = presentDiaryRows(rows, {
			controlVisible: true,
			layout: "slots",
		});
		expect(groups.map((group) => group.label)).toEqual([
			"Breakfast",
			"Lunch",
			"Other",
		]);
		expect(
			groups.find((group) => group.id === "other")?.rows.map((row) => row.id),
		).toEqual(["early-b", "same-a", "late"]);
		const timeline = presentDiaryRows(rows, {
			controlVisible: true,
			layout: "timeline",
		});
		expect(timeline).toHaveLength(1);
		expect(timeline[0]?.label).toBeNull();
		expect(timeline[0]?.rows.map((row) => row.id)).toEqual([
			"b",
			"early-b",
			"same-a",
			"lunch",
			"late",
		]);
	});

	it("does not reorder or drop rows when the control is hidden", () => {
		const rows = [
			{ id: "z", occurredAt: "2026-11-09T20:00:00.000Z", slotType: null },
			{ id: "a", occurredAt: "2026-11-09T08:00:00.000Z", slotType: "snack" },
		];
		expect(
			presentDiaryRows(rows, { controlVisible: false, layout: "slots" }),
		).toEqual([{ id: "all", label: null, rows }]);
	});

	it("changes only the caller's layout", () => {
		const caller = { theme: "dark" as const, diaryLayout: "timeline" as const };
		const other = { theme: "light" as const, diaryLayout: "timeline" as const };
		const next = applyDiaryLayout(caller, "slots");
		expect(next.diaryLayout).toBe("slots");
		expect(caller.diaryLayout).toBe("timeline");
		expect(other.diaryLayout).toBe("timeline");
	});
});

describe("set_diary_layout", () => {
	const tool = () =>
		createDiaryToolDefs({
			...createMockEnv(),
			FLAGS: { getBooleanValue: async () => true },
		} as unknown as McpToolsEnv).find(
			(item) => item.name === "set_diary_layout",
		);

	it("requires approval and writes only the calling user", async () => {
		patchUserSettings.mockReset();
		getUserSettings.mockReset();
		getUserSettings.mockResolvedValue({ diaryLayout: "slots" });
		const definition = tool();
		expect(definition?.needsApproval).toBe(true);
		if (!definition) throw new Error("missing set_diary_layout");
		const ctx = {
			userId: "user-a",
			organizationId: "org-1",
			scopes: ["mcp:preferences:write"],
			authMethod: "api_key",
			agentSurface: "mcp",
		} as McpToolContext;
		const result = await definition.handler(ctx, { layout: "slots" });
		expect(patchUserSettings).toHaveBeenCalledTimes(1);
		expect(patchUserSettings.mock.calls[0]?.[1]).toBe("user-a");
		expect(patchUserSettings.mock.calls[0]?.[2]).toEqual({
			diaryLayout: "slots",
		});
		expect(result.ok).toBe(true);
	});

	it("does not write when the flag is off or the iOS client is below 1.6", async () => {
		patchUserSettings.mockReset();
		const off = createDiaryToolDefs(
			createMockEnv() as unknown as McpToolsEnv,
		).find((item) => item.name === "set_diary_layout");
		if (!off) throw new Error("missing set_diary_layout");
		const ctx = {
			userId: "user-a",
			organizationId: "org-1",
			scopes: ["mcp:preferences:write"],
			authMethod: "api_key",
			agentSurface: "mcp",
		} as McpToolContext;
		const disabled = await off.handler(ctx, { layout: "slots" });
		expect(disabled.ok).toBe(false);
		const ios = createDiaryToolDefs({
			...createMockEnv(),
			FLAGS: { getBooleanValue: async () => true },
		} as unknown as McpToolsEnv).find(
			(item) => item.name === "set_diary_layout",
		);
		if (!ios) throw new Error("missing set_diary_layout");
		const oldIos = await ios.handler(
			{
				...ctx,
				agentSurface: "copilot",
				originatingClient: { clientPlatform: "ios", clientVersion: "1.5.16" },
			} as McpToolContext,
			{ layout: "timeline" },
		);
		expect(oldIos.ok).toBe(false);
		expect(patchUserSettings).not.toHaveBeenCalled();
	});
});
