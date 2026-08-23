export interface AdminAccountDeleteTarget {
	id: string;
	email: string;
	isAdmin: boolean;
	stripeCustomerId: string | null;
}

export type AdminAccountDeleteDecision =
	| { ok: true; target: AdminAccountDeleteTarget }
	| { ok: false; status: 400 | 404; error: string };

export function emailsMatchForAdminDelete(
	storedEmail: string,
	confirmEmail: string,
): boolean {
	return storedEmail.trim().toLowerCase() === confirmEmail.trim().toLowerCase();
}

/**
 * Safety gate for operator-initiated account wipe (self, other admins, email confirm).
 * Does not evaluate Crew eligibility — admin delete bypasses that gate.
 */
export function evaluateAdminAccountDelete(input: {
	adminUserId: string;
	target: AdminAccountDeleteTarget | null | undefined;
	confirmEmail: string;
}): AdminAccountDeleteDecision {
	if (!input.target) {
		return { ok: false, status: 404, error: "User not found" };
	}
	if (input.target.id === input.adminUserId) {
		return { ok: false, status: 400, error: "Cannot delete your own account" };
	}
	if (input.target.isAdmin) {
		return {
			ok: false,
			status: 400,
			error: "Revoke admin before deleting this account",
		};
	}
	if (!emailsMatchForAdminDelete(input.target.email, input.confirmEmail)) {
		return {
			ok: false,
			status: 400,
			error: "Confirmation email does not match this account",
		};
	}
	return { ok: true, target: input.target };
}
