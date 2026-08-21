interface DisplayNameInput {
	name?: string | null;
	email?: string | null;
}

export function getUserDisplayName(user: DisplayNameInput) {
	const normalizedName = user.name?.trim();
	if (normalizedName) return normalizedName;

	const normalizedEmail = user.email?.trim();
	if (normalizedEmail) return normalizedEmail;

	return "Unknown";
}

/** Signup INSERT name: never persist an empty string (Apple omits fullName on retry). */
export function resolveCreatedUserName(user: DisplayNameInput): string {
	const normalizedName = user.name?.trim();
	if (normalizedName) return normalizedName;

	const email = user.email?.trim();
	if (email) {
		const localPart = email.split("@")[0]?.trim();
		if (localPart) return localPart;
	}

	return getUserDisplayName(user);
}
