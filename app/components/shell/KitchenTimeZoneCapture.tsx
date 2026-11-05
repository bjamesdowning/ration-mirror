import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";
import { isValidIanaTimeZone } from "~/lib/kitchen-time";

/**
 * Owner/admin browsers write the IANA zone once, only when the kitchen has none.
 * The server ignores a later write so a trip cannot move Manifest and Supply days.
 */
export function KitchenTimeZoneCapture({
	enabled,
	organizationId,
}: {
	enabled: boolean;
	organizationId: string;
}) {
	const revalidator = useRevalidator();
	const startedFor = useRef<string | null>(null);

	useEffect(() => {
		if (!enabled || startedFor.current === organizationId) return;
		const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (!isValidIanaTimeZone(timeZone)) return;
		startedFor.current = organizationId;
		void fetch("/api/organization/supply-settings", {
			method: "PATCH",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ timeZone }),
		})
			.then((response) => {
				if (response.ok) revalidator.revalidate();
				else if (startedFor.current === organizationId) {
					startedFor.current = null;
				}
			})
			.catch(() => {
				if (startedFor.current === organizationId) startedFor.current = null;
			});
	}, [enabled, organizationId, revalidator]);

	return null;
}
