import { describe, expect, it, vi } from "vitest";
import {
	logMcpOAuthVerifyFailure,
	logOAuthFlowEvent,
} from "../oauth-telemetry.server";

vi.mock("../logging.server", () => ({
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	redactId: (id: string) => `red(${id})`,
}));

const { log } = await import("../logging.server");

describe("logOAuthFlowEvent", () => {
	it("includes correlation_id when provided", () => {
		logOAuthFlowEvent({
			step: "consent",
			outcome: "success",
			correlationId: "flow-abc-123",
			clientId: "client-xyz",
		});

		expect(log.info).toHaveBeenCalledWith(
			"oauth_flow",
			expect.objectContaining({
				event: "oauth_flow",
				step: "consent",
				outcome: "success",
				correlation_id: "red(flow-abc-123)",
				client_id_redacted: "red(client-xyz)",
			}),
		);
	});
});

describe("logMcpOAuthVerifyFailure", () => {
	it("logs normalized auth failure codes without secrets", () => {
		logMcpOAuthVerifyFailure({
			errorCode: "OAuth token audience mismatch",
			correlationId: "flow-abc-123",
		});

		expect(log.warn).toHaveBeenCalledWith(
			"mcp_oauth_verify_failed",
			expect.objectContaining({
				event: "mcp_oauth_verify_failed",
				error_code: "OAuth token audience mismatch",
				correlation_id: "red(flow-abc-123)",
			}),
		);
	});
});
