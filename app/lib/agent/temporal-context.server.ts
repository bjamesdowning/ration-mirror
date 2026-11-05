import { getUtcTodayISO } from "../cargo-utils";
import { kitchenTodayISO, resolveKitchenTimeZone } from "../kitchen-time";
import { getOrganizationMetadata } from "../org-supply-settings.server";
import type { OrganizationMetadata } from "../types";

export const EXPIRY_SEMANTICS = "utc_calendar_day" as const;

export function buildAgentTemporalContext(
	now = new Date(),
	metadata?: OrganizationMetadata | null,
) {
	const timeZone = resolveKitchenTimeZone(metadata);
	const todayUtc = getUtcTodayISO(now);
	return {
		todayUtc,
		today: timeZone ? kitchenTodayISO(metadata, now) : todayUtc,
		timeZone,
		serverTimeIso: now.toISOString(),
		expirySemantics: EXPIRY_SEMANTICS,
	};
}

export function formatCopilotTemporalContextAppend(
	now = new Date(),
	metadata?: OrganizationMetadata | null,
): string {
	const { today, todayUtc, timeZone, serverTimeIso } =
		buildAgentTemporalContext(now, metadata);
	const todayLabel = timeZone
		? `Today is ${today} (${timeZone}).`
		: `Today is ${todayUtc} (UTC).`;
	return `\n\nTemporal context: ${todayLabel} Server time: ${serverTimeIso}. Pantry expiry dates are UTC calendar days; an item expiring today is still valid today.`;
}

export async function formatCopilotTemporalContextForOrganization(
	db: D1Database,
	organizationId: string,
	now = new Date(),
): Promise<string> {
	const metadata = await getOrganizationMetadata(db, organizationId);
	return formatCopilotTemporalContextAppend(now, metadata);
}
