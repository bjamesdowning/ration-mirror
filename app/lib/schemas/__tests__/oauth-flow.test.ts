import { describe, expect, it } from "vitest";
import { oauthFlowRecordSchema } from "../oauth-flow";

describe("oauthFlowRecordSchema", () => {
	it("accepts a valid flow record", () => {
		const record = oauthFlowRecordSchema.parse({
			flowId: "00000000-0000-4000-8000-000000000001",
			step: "initiated",
			oauthQueryDigest: "a".repeat(64),
			clientId: "client-1",
			requestedScopes: ["mcp:read", "offline_access"],
			createdAt: 1_700_000_000_000,
			expiresAt: 1_700_000_600_000,
			version: 1,
		});
		expect(record.clientId).toBe("client-1");
	});

	it("rejects invalid digest length", () => {
		expect(() =>
			oauthFlowRecordSchema.parse({
				flowId: "00000000-0000-4000-8000-000000000001",
				step: "initiated",
				oauthQueryDigest: "short",
				clientId: "c",
				requestedScopes: [],
				createdAt: 1,
				expiresAt: 2,
				version: 1,
			}),
		).toThrow();
	});
});
