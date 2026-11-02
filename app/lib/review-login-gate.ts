export function shouldShowWebReviewPassword(input: {
	mode: "signIn" | "signUp";
	email: string;
	reviewEmail: string | null | undefined;
	appReviewLogin: boolean;
}): boolean {
	if (!input.appReviewLogin || input.mode !== "signIn") {
		return false;
	}
	const reviewEmail = input.reviewEmail?.trim().toLowerCase();
	if (!reviewEmail) {
		return false;
	}
	return input.email.trim().toLowerCase() === reviewEmail;
}
