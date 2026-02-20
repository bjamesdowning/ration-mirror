import { SupplyPreviewCard } from "~/components/hub/SupplyPreviewCard";
import type { supplyItem, supplyList } from "~/db/schema";
import type { HubWidgetProps } from "~/lib/types";

type SupplyListWithItems = typeof supplyList.$inferSelect & {
	items: (typeof supplyItem.$inferSelect)[];
};

export function SupplyPreviewWidget({ data }: HubWidgetProps) {
	const list = data.latestSupplyList as SupplyListWithItems | null;
	return <SupplyPreviewCard list={list} />;
}
