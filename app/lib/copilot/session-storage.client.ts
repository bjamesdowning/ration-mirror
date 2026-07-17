import type { CopilotModelPreset } from "./model-profiles";
import type { SessionUsageSnapshot } from "./session-usage";

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
	sessionUsage?: SessionUsageSnapshot | null;
};

function storageKey(organizationId: string): string {
	return `ration:copilot:${organizationId}`;
}

function parseStoredSessionUsage(value: unknown): SessionUsageSnapshot | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as Record<string, unknown>;
	if (
		typeof raw.totalTokens !== "number" ||
		typeof raw.maxTokens !== "number" ||
		typeof raw.messageCount !== "number" ||
		typeof raw.maxMessages !== "number" ||
		typeof raw.creditsCharged !== "number" ||
		typeof raw.creditBalance !== "number"
	) {
		return null;
	}
	return {
		totalTokens: Math.max(0, Math.ceil(raw.totalTokens)),
		maxTokens: Math.max(1, Math.ceil(raw.maxTokens)),
		messageCount: Math.max(0, Math.ceil(raw.messageCount)),
		maxMessages: Math.max(1, Math.ceil(raw.maxMessages)),
		creditsCharged: Math.max(0, Math.ceil(raw.creditsCharged)),
		creditBalance: Math.max(0, Math.ceil(raw.creditBalance)),
		nextCreditAt:
			typeof raw.nextCreditAt === "number" ? raw.nextCreditAt : null,
		nextCreditThreshold:
			typeof raw.nextCreditThreshold === "number"
				? raw.nextCreditThreshold
				: null,
	};
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
			sessionUsage: parseStoredSessionUsage(parsed.sessionUsage),
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
		"conversationId" | "messages" | "modelPreset" | "sessionUsage"
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
			sessionUsage: SessionUsageSnapshot | null;
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
			sessionUsage: snapshot.sessionUsage ?? null,
		};
	}
	return { kind: "fresh" };
}
