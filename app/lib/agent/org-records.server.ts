/**
 * Shared personal-org record builder used by Better Auth signup hook and
 * agent self-registration so both paths create identical org/member rows.
 */

export function buildPersonalOrgRecords(userId: string, userName: string) {
	const personalOrgId = crypto.randomUUID();
	const memberId = crypto.randomUUID();
	const now = new Date();

	return {
		orgId: personalOrgId,
		orgValues: {
			id: personalOrgId,
			name: `${userName || "My"}'s Personal Group`,
			slug: `personal-${userId}`,
			metadata: { isPersonal: true } as const,
			credits: 0,
			createdAt: now,
		},
		memberValues: {
			id: memberId,
			organizationId: personalOrgId,
			userId,
			role: "owner" as const,
			createdAt: now,
		},
	};
}
