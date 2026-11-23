/** Destination of the fourth Fuel log (`openFuelPurchase` on the Fuel page). */
export const CREW_PAYWALL_HREF = "/hub/pricing";

/**
 * True when creating a saved list hit the quota.
 * The throw is `capacity_exceeded:supplyLists:<current>:<limit>`.
 * `handleApiError` rewrites that to a body whose `error` is `capacity_exceeded`.
 */
export function isSupplyListCapacityError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return (
		error.message === "capacity_exceeded" ||
		error.message.startsWith("capacity_exceeded:")
	);
}
