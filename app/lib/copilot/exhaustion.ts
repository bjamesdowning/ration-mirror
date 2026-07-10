/** Subset of `/api/copilot/status` used for launcher/dock disable logic. */
export type CopilotExhaustionStatus = {
	tier: string;
	freeConversationsRemaining: number;
	creditBalance: number;
	autoDeductConsent: boolean;
	conversationFloorCost: number;
};

/**
 * True when the user cannot start a new Copilot conversation at all.
 * Crew members without auto-deduct consent are not exhausted — they can open Ask to consent.
 */
export function isCopilotExhausted(
	status: CopilotExhaustionStatus | null | undefined,
): boolean {
	if (!status) return false;
	if (status.freeConversationsRemaining > 0) return false;
	if (status.creditBalance >= status.conversationFloorCost) return false;
	if (status.tier === "crew_member" && !status.autoDeductConsent) return false;
	return true;
}
