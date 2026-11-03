import { describe, expect, it } from "vitest";
import {
	buildCopilotMcpContext,
	COPILOT_MCP_SCOPES,
	createCopilotToolDefs,
} from "~/lib/copilot/tools.server";
import type { McpToolContext } from "~/lib/mcp/auth";
import type { McpToolsEnv } from "~/lib/mcp/tool-runtime";
import { createMockEnv } from "~/test/helpers/mock-env";

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

const ctx = {
	organizationId: "org-test-123",
	userId: "user-test-123",
	scopes: [...COPILOT_MCP_SCOPES],
} as unknown as McpToolContext;

describe("MCP destructive annotations", () => {
	const defs = createCopilotToolDefs(makeEnv());

	it("marks every always-approval tool as destructive", () => {
		const approvalTools = defs.filter((def) => def.needsApproval === true);
		expect(approvalTools.length).toBeGreaterThanOrEqual(8);
		const missing = approvalTools
			.filter((def) => def.destructiveHint !== true)
			.map((def) => def.name);
		expect(missing).toEqual([]);
	});

	it.each([
		"delete_meal",
		"clear_active_meals",
		"remove_cargo_item",
		"import_inventory_csv",
		"commit_manifest_plan",
		"complete_supply_list",
	])("%s sets destructiveHint and needsApproval", (name) => {
		const def = defs.find((d) => d.name === name);
		expect(def?.needsApproval).toBe(true);
		expect(def?.destructiveHint).toBe(true);
	});

	it("import_inventory_csv refuses without confirm:true", async () => {
		const def = defs.find((d) => d.name === "import_inventory_csv");
		expect(def).toBeDefined();
		const out = await def?.handler(ctx, {
			csv: "name,quantity\nrice,1",
			idempotencyKey: "idem-key-123",
			confirm: false,
		});
		expect(out?.ok).toBe(false);
		if (out && !out.ok) expect(out.error.code).toBe("invalid_input");
	});

	it("commit_manifest_plan refuses without confirm:true", async () => {
		const def = defs.find((d) => d.name === "commit_manifest_plan");
		expect(def).toBeDefined();
		const out = await def?.handler(ctx, {
			entries: [],
			syncSupply: false,
			confirm: false,
		});
		expect(out?.ok).toBe(false);
		if (out && !out.ok) expect(out.error.code).toBe("invalid_input");
	});

	it("requires confirm in the input schema of both gated tools", () => {
		for (const name of ["import_inventory_csv", "commit_manifest_plan"]) {
			const def = defs.find((d) => d.name === name);
			expect(def?.inputSchema.shape).toHaveProperty("confirm");
		}
	});

	it("get_context describes caller identity", () => {
		const def = defs.find((d) => d.name === "get_context");
		expect(def?.description).toContain("caller identity");
	});

	it("no tool description says 'no second host approval step'", () => {
		for (const def of defs) {
			expect(def.description).not.toContain("no second host approval step");
		}
	});
});
