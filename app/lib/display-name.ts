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
