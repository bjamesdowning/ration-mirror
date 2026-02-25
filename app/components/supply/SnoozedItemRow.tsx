import { useEffect } from "react";
import { useFetcher } from "react-router";
import type { ItemDomain } from "~/lib/domain";
import { DOMAIN_ICONS } from "~/lib/domain";
import { formatSnoozeTimeLeft, toTitleCase } from "~/lib/format-display";
import type { ActiveSnooze } from "~/lib/supply.server";

interface SnoozedItemRowProps {
	snooze: ActiveSnooze;
	listId: string;
	onUnsnooze?: () => void;
}

export function SnoozedItemRow({
	snooze,
	listId,
	onUnsnooze,
}: SnoozedItemRowProps) {
	const fetcher = useFetcher<{ unsnoozed?: boolean }>();
	const isPending = fetcher.state !== "idle";

	const handleUnsnooze = () => {
		fetcher.submit(null, {
			method: "DELETE",
			action: `/api/supply-lists/${listId}/snoozes/${snooze.id}`,
		});
	};

	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data?.unsnoozed) {
			onUnsnooze?.();
		}
	}, [fetcher.state, fetcher.data, onUnsnooze]);

	const domain = (snooze.domain ?? "food") as ItemDomain;
	const Icon = DOMAIN_ICONS[domain];
	const snoozedUntil =
		snooze.snoozedUntil instanceof Date
			? snooze.snoozedUntil
			: new Date(snooze.snoozedUntil);

	return (
		<div
			className={`group py-3 px-4 border-b border-platinum last:border-0 flex items-center justify-between gap-3 transition-all ${
				isPending ? "opacity-60" : ""
			}`}
		>
			<div className="flex items-center gap-3 min-w-0 flex-1">
				<Icon className="w-5 h-5 flex-shrink-0 text-muted" aria-hidden="true" />
				<span className="text-carbon truncate">
					{toTitleCase(snooze.normalizedName)}
				</span>
			</div>
			<span className="text-sm text-muted flex-shrink-0">
				{formatSnoozeTimeLeft(snoozedUntil)}
			</span>
			<button
				type="button"
				onClick={handleUnsnooze}
				disabled={isPending}
				className="flex-shrink-0 px-3 py-1.5 text-sm font-semibold rounded-lg bg-hyper-green/10 text-hyper-green hover:bg-hyper-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				aria-label={`Unsnooze ${toTitleCase(snooze.normalizedName)}`}
			>
				Unsnooze
			</button>
		</div>
	);
}
