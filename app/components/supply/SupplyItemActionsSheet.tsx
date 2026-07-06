import { RefreshCcw } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { lockBodyScroll } from "~/lib/body-scroll-lock";
import type { SupplyItemOrigin } from "~/lib/supply-item-origins";
import {
	resolveSupplyItemSources,
	type SupplyItemSource,
	type SupplyItemSourceInput,
} from "~/lib/supply-sources";
import { SupplyItemOriginBadge } from "./SupplyItemOriginBadge";

interface SupplyItemActionsSheetProps extends SupplyItemSourceInput {
	itemName: string;
	isMealSourced: boolean;
	convertLabel: string;
	isPending: boolean;
	isConvertPending: boolean;
	sourceOrigins?: SupplyItemOrigin[];
	onClose: () => void;
	onConvert: () => void;
	onSnooze: (duration: "24h" | "3d" | "1w") => void;
	onRemove: () => void;
}

function SourceMealsSection({ sources }: { sources: SupplyItemSource[] }) {
	if (sources.length === 0) {
		return <p className="text-sm text-muted mb-4">Added manually</p>;
	}

	return (
		<div className="mb-4">
			<p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">
				From meals
			</p>
			<ul className="space-y-1">
				{sources.map((source) => (
					<li key={source.id ?? source.name} className="text-sm">
						{source.id ? (
							<Link
								to={`/hub/galley/${source.id}`}
								className="text-hyper-green hover:underline"
								onClick={(e) => e.stopPropagation()}
							>
								{source.name}
							</Link>
						) : (
							<span className="text-carbon dark:text-white">{source.name}</span>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}

export function SupplyItemActionsSheet({
	itemName,
	isMealSourced,
	convertLabel,
	isPending,
	isConvertPending,
	sourceMealName,
	sourceMealNames,
	sourceMealSources,
	sourceOrigins = [],
	onClose,
	onConvert,
	onSnooze,
	onRemove,
}: SupplyItemActionsSheetProps) {
	const sources = resolveSupplyItemSources({
		sourceMealName,
		sourceMealNames,
		sourceMealSources,
	});

	useEffect(() => lockBodyScroll(), []);

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [onClose]);

	const sheet = (
		<>
			<button
				type="button"
				className="fixed inset-0 z-[99] bg-carbon/50 backdrop-blur-sm animate-fade-in border-none cursor-default"
				onClick={onClose}
				aria-label="Close actions"
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="supply-item-actions-title"
				data-testid="supply-item-actions-sheet"
				className="fixed bottom-0 left-0 right-0 z-[100] bg-ceramic dark:bg-[#1A1A1A] rounded-t-3xl shadow-2xl animate-slide-up safe-area-pb"
			>
				<div className="flex justify-center pt-3 pb-2">
					<div className="w-10 h-1 bg-platinum dark:bg-white/20 rounded-full" />
				</div>
				<div className="px-6 pb-6">
					<h3
						id="supply-item-actions-title"
						className="text-lg font-bold text-carbon dark:text-white mb-1 truncate"
					>
						{itemName}
					</h3>
					{sourceOrigins.length > 0 && (
						<div className="mb-3">
							<SupplyItemOriginBadge origins={sourceOrigins} />
						</div>
					)}
					<SourceMealsSection sources={sources} />
					<div className="space-y-2">
						<button
							type="button"
							onClick={() => {
								onConvert();
								onClose();
							}}
							disabled={isPending}
							className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-carbon dark:text-white hover:bg-platinum dark:hover:bg-white/10 transition-colors disabled:opacity-50"
						>
							<RefreshCcw
								className={`w-4 h-4 text-muted ${isConvertPending ? "animate-spin" : ""}`}
								aria-hidden="true"
							/>
							{convertLabel}
						</button>
						{isMealSourced && (
							<>
								<button
									type="button"
									onClick={() => {
										onSnooze("24h");
										onClose();
									}}
									disabled={isPending}
									className="w-full px-4 py-3 rounded-xl text-left text-carbon dark:text-white hover:bg-platinum dark:hover:bg-white/10 transition-colors disabled:opacity-50"
								>
									Snooze 24 hours
								</button>
								<button
									type="button"
									onClick={() => {
										onSnooze("3d");
										onClose();
									}}
									disabled={isPending}
									className="w-full px-4 py-3 rounded-xl text-left text-carbon dark:text-white hover:bg-platinum dark:hover:bg-white/10 transition-colors disabled:opacity-50"
								>
									Snooze 3 days
								</button>
								<button
									type="button"
									onClick={() => {
										onSnooze("1w");
										onClose();
									}}
									disabled={isPending}
									className="w-full px-4 py-3 rounded-xl text-left text-carbon dark:text-white hover:bg-platinum dark:hover:bg-white/10 transition-colors disabled:opacity-50"
								>
									Snooze 1 week
								</button>
							</>
						)}
						<div className="border-t border-platinum dark:border-white/10 my-2" />
						<button
							type="button"
							onClick={() => {
								onRemove();
								onClose();
							}}
							disabled={isPending}
							className="w-full px-4 py-3 rounded-xl text-left text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
						>
							Remove from list
						</button>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="w-full mt-4 py-3 text-center text-muted font-medium hover:text-carbon dark:hover:text-white transition-colors"
					>
						Cancel
					</button>
				</div>
			</div>
		</>
	);

	if (typeof document === "undefined") return null;
	return createPortal(sheet, document.body);
}
