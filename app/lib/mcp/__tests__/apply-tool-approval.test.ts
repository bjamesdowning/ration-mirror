/**
 * apply_inventory_remove / apply_inventory_import: shared definitions stay
 * approval-free (MCP clients unchanged); Copilot adds host approval only via
 * the `approvalOverride` (flag `copilot-confirm-scope`).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import {
	buildCopilotMcpContext,
	COPILOT_MCP_SCOPES,
	createCopilotToolDefs,
	toAiSdkTools,
} from "~/lib/copilot/tools.server";
import {
	type McpToolsEnv,
	registerSharedMcpTool,
} from "~/lib/mcp/tool-runtime";
import { createMockEnv } from "~/test/helpers/mock-env";

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: vi.fn().mockResolvedValue({
		allowed: true,
		remaining: 10,
		resetAt: Date.now() + 60_000,
	}),
}));

const APPLY_TOOLS = ["apply_inventory_remove", "apply_inventory_import"];

function makeEnv(): McpToolsEnv {
	return {
		...createMockEnv(),
		__mcp: buildCopilotMcpContext({
			organizationId: "org-test-123",
			userId: "user-test-123",
			scopes: [...COPILOT_MCP_SCOPES],
			preClaim: false,
		}),
	} as unknown as McpToolsEnv;
}

const copilotCtx = {
	organizationId: "org-test-123",
	userId: "user-test-123",
	scopes: [...COPILOT_MCP_SCOPES],
	preClaim: false,
};

type ApprovalFn = (args: Record<string, unknown>, opts?: unknown) => unknown;

function needsApprovalOf(tools: Record<string, unknown>, name: string) {
	const fn = (tools[name] as { needsApproval?: ApprovalFn }).needsApproval;
	return fn ? fn({}, { toolCallId: "t1", messages: [] }) : false;
}

describe("apply_* shared definitions", () => {
	const defs = createCopilotToolDefs(makeEnv());

	it.each(APPLY_TOOLS)(
		"%s has no needsApproval and is destructive + idempotent",
		(name) => {
			const def = defs.find((d) => d.name === name);
			expect(def).toBeDefined();
			expect(def?.needsApproval).toBeUndefined();
			expect(def?.destructiveHint).toBe(true);
			expect(def?.idempotentHint).toBe(true);
			expect(def?.description).not.toMatch(/Copilot|Approve/);
		},
	);

	it.each(APPLY_TOOLS)(
		"%s registers MCP annotations destructive + idempotent",
		(name) => {
			const def = defs.find((d) => d.name === name);
			const registerTool = vi.fn();
			registerSharedMcpTool(
				{ registerTool } as unknown as McpServer,
				makeEnv(),
				def as NonNullable<typeof def>,
			);
			const annotations = registerTool.mock.calls[0]?.[1]?.annotations;
			expect(annotations).toMatchObject({
				destructiveHint: true,
				idempotentHint: true,
				readOnlyHint: false,
			});
		},
	);
});

describe("toAiSdkTools approvalOverride", () => {
	const env = createMockEnv() as unknown as Cloudflare.Env;

	it("flag on: both apply tools need host approval; other tools unchanged", async () => {
		const onApprovalRequested = vi.fn();
		const tools = toAiSdkTools(
			env,
			copilotCtx,
			{ onApprovalRequested },
			{
				approvalOverride: (toolName) =>
					APPLY_TOOLS.includes(toolName) ? true : undefined,
			},
		) as Record<string, unknown>;
		for (const name of APPLY_TOOLS) {
			expect(await needsApprovalOf(tools, name)).toBe(true);
		}
		expect(onApprovalRequested).toHaveBeenCalledWith("apply_inventory_remove");
		expect(await needsApprovalOf(tools, "add_cargo_item")).toBe(false);
	});

	it("flag off (no override or undefined): apply tools need no approval", async () => {
		const plain = toAiSdkTools(env, copilotCtx) as Record<string, unknown>;
		const undef = toAiSdkTools(env, copilotCtx, undefined, {
			approvalOverride: () => undefined,
		}) as Record<string, unknown>;
		for (const name of APPLY_TOOLS) {
			expect(await needsApprovalOf(plain, name)).toBe(false);
			expect(await needsApprovalOf(undef, name)).toBe(false);
		}
	});
});
