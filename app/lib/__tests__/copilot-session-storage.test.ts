import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearCopilotSession,
	loadCopilotSession,
	resolveCopilotOrgHydration,
	saveCopilotSession,
	touchCopilotSession,
} from "../copilot/session-storage.client";

function createSessionStorageMock() {
	const store = new Map<string, string>();
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
		clear: () => {
			store.clear();
		},
	};
}

describe("copilot session storage", () => {
	const orgId = "org-test-1";
	const idleMs = 60_000;

	beforeEach(() => {
		vi.stubGlobal("sessionStorage", createSessionStorageMock());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns null when no snapshot exists", () => {
		expect(loadCopilotSession(orgId, idleMs)).toBeNull();
	});

	it("persists and reloads an active snapshot", () => {
		touchCopilotSession(orgId, {
			conversationId: "conv-1",
			messages: [{ id: "m1", role: "user", content: "hello" }],
			modelPreset: "deep",
		});
		const loaded = loadCopilotSession(orgId, idleMs);
		expect(loaded?.conversationId).toBe("conv-1");
		expect(loaded?.messages).toHaveLength(1);
		expect(loaded?.modelPreset).toBe("deep");
	});

	it("clears expired snapshots", () => {
		saveCopilotSession(orgId, {
			conversationId: "conv-old",
			messages: [],
			modelPreset: "fast",
			lastActivityAt: Date.now() - 120_000,
		});
		expect(loadCopilotSession(orgId, idleMs)).toBeNull();
		expect(sessionStorage.getItem(`ration:copilot:${orgId}`)).toBeNull();
	});

	it("clearCopilotSession removes stored data", () => {
		touchCopilotSession(orgId, {
			conversationId: "conv-2",
			messages: [],
			modelPreset: "fast",
		});
		clearCopilotSession(orgId);
		expect(loadCopilotSession(orgId, idleMs)).toBeNull();
	});

	it("resolveCopilotOrgHydration returns fresh when snapshot is missing", () => {
		expect(resolveCopilotOrgHydration(null)).toEqual({ kind: "fresh" });
	});

	it("resolveCopilotOrgHydration restores snapshot contents", () => {
		const snapshot = {
			conversationId: "conv-restore",
			messages: [{ id: "m1", role: "user" as const, content: "hi" }],
			modelPreset: "fast" as const,
			lastActivityAt: Date.now(),
		};
		expect(resolveCopilotOrgHydration(snapshot)).toEqual({
			kind: "restore",
			conversationId: "conv-restore",
			messages: snapshot.messages,
			modelPreset: "fast",
		});
	});
});
