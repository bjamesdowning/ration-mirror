/** Intents that mutate a single user row and update the Users table locally. */
export const ADMIN_SKIP_LOADER_REVALIDATE_INTENTS = [
	"toggle-admin",
	"delete-account",
] as const;

export type AdminSkipLoaderRevalidateIntent =
	(typeof ADMIN_SKIP_LOADER_REVALIDATE_INTENTS)[number];

export function isAdminSkipLoaderRevalidateIntent(
	intent: FormDataEntryValue | null,
): intent is AdminSkipLoaderRevalidateIntent {
	return (
		typeof intent === "string" &&
		(ADMIN_SKIP_LOADER_REVALIDATE_INTENTS as readonly string[]).includes(intent)
	);
}

/**
 * Grant Admin / Delete account POSTs must not re-run the ~25-query dashboard
 * loader. Failed-purge retry still revalidates so the job list refreshes.
 */
export function shouldAdminRevalidate(args: {
	formMethod?: string;
	formAction?: string;
	formData?: FormData;
	defaultShouldRevalidate: boolean;
}): boolean {
	if (isAdminSkipLoaderRevalidateIntent(args.formData?.get("intent") ?? null)) {
		return false;
	}
	if (args.formAction || (args.formMethod && args.formMethod !== "GET")) {
		return args.defaultShouldRevalidate;
	}
	return false;
}
