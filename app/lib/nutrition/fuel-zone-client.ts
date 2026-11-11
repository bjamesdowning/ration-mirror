import { isValidIanaTimeZone } from "~/lib/kitchen-time";

export const FUEL_ZONE_UNUSABLE =
	"This device's time zone can't be used for Fuel logs.";

/** Browser IANA zone. Offsets and abbreviations are not sent. */
export function deviceFuelTimeZone(): string | undefined {
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	return isValidIanaTimeZone(zone) ? zone : undefined;
}

export function withDeviceFuelZone<T extends Record<string, unknown>>(
	body: T,
): T & { fuelTimeZone?: string } {
	const zone = deviceFuelTimeZone();
	return zone ? { ...body, fuelTimeZone: zone } : body;
}

/**
 * One settings write, then one retry, only for an old Worker that still
 * requires a stored zone. The normal path is the field on the write.
 */
export async function retryFuelZoneOnce(
	response: Response,
	retry: () => Promise<Response>,
): Promise<Response> {
	if (response.ok) return response;
	const body = (await response
		.clone()
		.json()
		.catch(() => null)) as { code?: string } | null;
	if (body?.code !== "fuel_timezone_required") return response;
	const zone = deviceFuelTimeZone();
	if (!zone) return response;
	const patched = await fetch("/hub/settings", {
		method: "POST",
		credentials: "same-origin",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			intent: "update-fuel-timezone",
			fuelTimeZone: zone,
		}),
	});
	if (!patched.ok) return response;
	return retry();
}
