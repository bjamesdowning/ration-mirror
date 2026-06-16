import { describe, expect, it, vi } from "vitest";
import { auditMcpWrite } from "../audit";
import type { McpToolContext } from "../auth";

vi.mock("~/lib/logging.server", () => ({
	log: { info: vi.fn() },
	redactId: (value: string | null | undefined) =>
		value ? `redacted:${value}` : "redacted",
}));

const { log } = await import("~/lib/logging.server");

function makeCtx(overrides: Partial<McpToolContext> = {}): McpToolContext {
	return {
		organizationId: "org-abcdefghijklmnop",
		userId: "user-abcdefghijklmnop",
		scopes: ["mcp:read"],
		authMethod: "api_key",
		apiKeyId: "key-abcdefghijklmnop",
		keyName: "Test Key",
		keyPrefix: "rtn_live_abcd1234",
		preClaim: false,
		...overrides,
	};
}

describe("auditMcpWrite", () => {
	it("redacts organization, user, and credential identifiers", () => {
		auditMcpWrite(makeCtx(), { tool: "add_cargo_item", outcome: "ok" });

		expect(log.info).toHaveBeenCalledWith(
			"mcp_audit",
			expect.objectContaining({
				organizationId: "redacted:org-abcdefghijklmnop",
				userId: "redacted:user-abcdefghijklmnop",
				apiKeyId: "redacted:key-abcdefghijklmnop",
				keyPrefix: "redacted:rtn_live_abcd1234",
			}),
		);
	});

	it("redacts delegation actor and subject ids", () => {
		auditMcpWrite(
			makeCtx({
				delegation: {
					actorClientId: "fin-client-abcdefghijklmnop",
					subjectUserId: "subject-user-abcdefghijklmnop",
					subjectOrganizationId: "subject-org-abcdefghijklmnop",
				},
			}),
			{ tool: "list_inventory", outcome: "ok" },
		);

		expect(log.info).toHaveBeenCalledWith(
			"mcp_audit",
			expect.objectContaining({
				delegated: true,
				actorClientId: "redacted:fin-client-abcdefghijklmnop",
				subjectUserId: "redacted:subject-user-abcdefghijklmnop",
				subjectOrganizationId: "redacted:subject-org-abcdefghijklmnop",
			}),
		);
	});
});
