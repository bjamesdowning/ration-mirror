/**
 * Pure helpers for the pricing page embedded checkout flow.
 * Extracted for unit testability.
 */

export interface CheckoutFetcherData {
	success?: boolean;
	clientSecret?: string;
	sessionId?: string;
	error?: string;
}

/**
 * Returns true when we should apply fetcher data to local checkout state.
 * Used to sync clientSecret/sessionId from API response into component state.
 *
 * Critical: After closeCheckout() we call fetcher.reset(), which clears fetcher.data.
 * With fetcher.data undefined, this returns false, preventing re-opening.
 */
export function shouldSyncCheckoutFromFetcher(
	fetcherData: CheckoutFetcherData | undefined,
	currentClientSecret: string | null,
): boolean {
	return !!(
		fetcherData?.success &&
		fetcherData?.clientSecret &&
		currentClientSecret !== fetcherData.clientSecret
	);
}
