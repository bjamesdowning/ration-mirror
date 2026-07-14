import type { CopilotModelPreset } from "./model-profiles";

export type CopilotStoredMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
};

export type CopilotSessionSnapshot = {
	conversationId: string;
	messages: CopilotStoredMessage[];
	modelPreset: CopilotModelPreset;
	lastActivityAt: number;
};

function storageKey(organizationId: string): string {
	return `ration:copilot:${organizationId}`;
}

export function toStoredCopilotMessages(
	messages: Array<{
		id: string;
		role: "user" | "assistant";
		content: string;
	}>,
): CopilotStoredMessage[] {
	return messages.map(({ id, role, content }) => ({ id, role, content }));
}

export function loadCopilotSession(
	organizationId: string,
	sessionIdleMs: number,
): CopilotSessionSnapshot | null {
	if (typeof sessionStorage === "undefined") return null;
	try {
		const raw = sessionStorage.getItem(storageKey(organizationId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CopilotSessionSnapshot;
		if (
			!parsed.conversationId ||
			!Array.isArray(parsed.messages) ||
			typeof parsed.lastActivityAt !== "number"
		) {
			sessionStorage.removeItem(storageKey(organizationId));
			return null;
		}
		if (Date.now() - parsed.lastActivityAt > sessionIdleMs) {
			sessionStorage.removeItem(storageKey(organizationId));
			return null;
		}
		return {
			...parsed,
			modelPreset: parsed.modelPreset === "deep" ? "deep" : "fast",
		};
	} catch {
		sessionStorage.removeItem(storageKey(organizationId));
		return null;
	}
}

export function saveCopilotSession(
	organizationId: string,
	snapshot: CopilotSessionSnapshot,
): void {
	if (typeof sessionStorage === "undefined") return;
	try {
		sessionStorage.setItem(
			storageKey(organizationId),
			JSON.stringify(snapshot),
		);
	} catch {
		// sessionStorage full or unavailable — ignore
	}
}

export function clearCopilotSession(organizationId: string): void {
	if (typeof sessionStorage === "undefined") return;
	sessionStorage.removeItem(storageKey(organizationId));
}

export function touchCopilotSession(
	organizationId: string,
	partial: Pick<
		CopilotSessionSnapshot,
		"conversationId" | "messages" | "modelPreset"
	>,
): void {
	saveCopilotSession(organizationId, {
		...partial,
		lastActivityAt: Date.now(),
	});
}

export type CopilotOrgHydration =
	| {
			kind: "restore";
			conversationId: string;
			messages: CopilotStoredMessage[];
			modelPreset: CopilotModelPreset;
	  }
	| { kind: "fresh" };

export function resolveCopilotOrgHydration(
	snapshot: CopilotSessionSnapshot | null,
): CopilotOrgHydration {
	if (snapshot) {
		return {
			kind: "restore",
			conversationId: snapshot.conversationId,
			messages: snapshot.messages,
			modelPreset: snapshot.modelPreset,
		};
	}
	return { kind: "fresh" };
}
