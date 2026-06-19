/** Synthetic email domain for unclaimed agent kitchen stub users. */
export const AGENT_STUB_EMAIL_DOMAIN = "@agents.ration.mayutic.com";

/** SQL LIKE pattern matching agent stub emails (`agent+<id>@agents...`). */
export const AGENT_STUB_EMAIL_LIKE_PATTERN = `agent+%${AGENT_STUB_EMAIL_DOMAIN}`;

export function buildAgentStubEmail(userId: string): string {
	return `agent+${userId}${AGENT_STUB_EMAIL_DOMAIN}`;
}

export function isAgentStubEmail(email: string): boolean {
	return email.endsWith(AGENT_STUB_EMAIL_DOMAIN) && email.startsWith("agent+");
}

export interface ReengagementRecipientUser {
	email: string;
	emailVerified: boolean;
}

/** Verified humans only — excludes agent stub kitchens and unverified accounts. */
export function isReengagementEmailRecipient(
	user: ReengagementRecipientUser,
): boolean {
	return user.emailVerified && !isAgentStubEmail(user.email);
}
