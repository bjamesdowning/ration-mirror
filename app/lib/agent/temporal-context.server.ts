import { getUtcTodayISO } from "../cargo-utils";

export const EXPIRY_SEMANTICS = "utc_calendar_day" as const;

export function buildAgentTemporalContext(now = new Date()) {
	return {
		todayUtc: getUtcTodayISO(now),
		serverTimeIso: now.toISOString(),
		expirySemantics: EXPIRY_SEMANTICS,
	};
}

export function formatCopilotTemporalContextAppend(now = new Date()): string {
	const { todayUtc, serverTimeIso } = buildAgentTemporalContext(now);
	return `\n\nTemporal context: Today is ${todayUtc} (UTC). Server time: ${serverTimeIso}. Pantry expiry dates are UTC calendar days; an item expiring today is still valid today.`;
}
