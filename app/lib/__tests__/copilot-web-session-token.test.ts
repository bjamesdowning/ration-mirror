import { describe, expect, it } from "vitest";
import {
	consumeCopilotWebSessionToken,
	createCopilotWebSessionToken,
} from "~/lib/copilot/web-session-token.server";

class MemoryKV {
	private store = new Map<string, string>();

	async get(key: string, type?: "json") {
		const value = this.store.get(key) ?? null;
		if (type === "json" && value) return JSON.parse(value);
		return value;
	}

	async put(key: string, value: string) {
		this.store.set(key, value);
	}

	async delete(key: string) {
		this.store.delete(key);
	}
}

function envWithKv() {
	return { RATION_KV: new MemoryKV() as unknown as KVNamespace };
}

describe("copilot web session tokens", () => {
	it("creates a short-lived token and consumes it once", async () => {
		const env = envWithKv();
		const { token, expiresAt } = await createCopilotWebSessionToken(env, {
			userId: "user-1",
			organizationId: "org-1",
			tier: "crew_member",
		});

		expect(token.length).toBeGreaterThan(32);
		expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

		await expect(consumeCopilotWebSessionToken(env, token)).resolves.toEqual({
			userId: "user-1",
			organizationId: "org-1",
			tier: "crew_member",
			source: "web",
		});
		await expect(consumeCopilotWebSessionToken(env, token)).resolves.toBeNull();
	});

	it("rejects malformed tokens without reading KV", async () => {
		const env = envWithKv();
		await expect(
			consumeCopilotWebSessionToken(env, "../not-a-token"),
		).resolves.toBeNull();
	});
});
