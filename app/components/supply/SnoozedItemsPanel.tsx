import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { ItemDomain } from "~/lib/domain";
import { DOMAIN_ICONS, DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import type { ActiveSnooze } from "~/lib/supply.server";
import { SnoozedItemRow } from "./SnoozedItemRow";

interface SnoozedItemsPanelProps {
	snoozes: ActiveSnooze[];
	listId: string;
	onUnsnooze?: () => void;
}

export function SnoozedItemsPanel({
	snoozes,
	listId,
	onUnsnooze,
}: SnoozedItemsPanelProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	if (snoozes.length === 0) return null;

	const groupedByDomain = snoozes.reduce<Record<ItemDomain, ActiveSnooze[]>>(
		(acc, snooze) => {
			const domain = (snooze.domain ?? "food") as ItemDomain;
			acc[domain].push(snooze);
			return acc;
		},
		{
			food: [],
			household: [],
			alcohol: [],
		},
	);

	return (
		<section className="space-y-4">
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="flex items-center justify-between w-full py-3 px-4 rounded-xl bg-platinum/50 hover:bg-platinum/70 transition-colors text-left"
				aria-expanded={isExpanded}
				aria-controls="snoozed-items-content"
				id="snoozed-items-header"
			>
				<div className="flex items-center gap-3">
					{isExpanded ? (
						<ChevronUp className="w-5 h-5 text-muted" aria-hidden="true" />
					) : (
						<ChevronDown className="w-5 h-5 text-muted" aria-hidden="true" />
					)}
					<h3 className="text-lg font-semibold text-carbon">
						Snoozed ({snoozes.length})
					</h3>
				</div>
			</button>

			{isExpanded && (
				<section
					id="snoozed-items-content"
					aria-labelledby="snoozed-items-header"
					className="space-y-4"
				>
					{ITEM_DOMAINS.map((domain) => {
						const domainSnoozes = groupedByDomain[domain];
						if (domainSnoozes.length === 0) return null;

						const Icon = DOMAIN_ICONS[domain];
						return (
							<div key={domain} className="space-y-2">
								<div className="flex items-center gap-3 px-1">
									<Icon className="w-4 h-4 text-muted" aria-hidden="true" />
									<span className="text-sm font-medium text-muted">
										{DOMAIN_LABELS[domain]}
									</span>
								</div>
								<div className="glass-panel rounded-xl overflow-hidden">
									{domainSnoozes.map((snooze) => (
										<SnoozedItemRow
											key={snooze.id}
											snooze={snooze}
											listId={listId}
											onUnsnooze={onUnsnooze}
										/>
									))}
								</div>
							</div>
						);
					})}
				</section>
			)}
		</section>
	);
}
