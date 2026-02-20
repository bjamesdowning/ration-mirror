import { ExpiringCargoCard } from "~/components/hub/ExpiringCargoCard";
import type { cargo } from "~/db/schema";
import type { HubWidgetProps } from "~/lib/types";

export function CargoExpiringWidget({ data }: HubWidgetProps) {
	const items = data.expiringItems as (typeof cargo.$inferSelect)[];
	return (
		<ExpiringCargoCard items={items} alertDays={data.expirationAlertDays} />
	);
}
