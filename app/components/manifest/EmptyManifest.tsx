import { CalendarIcon } from "~/components/icons/PageIcons";
import type { SlotType } from "~/lib/schemas/manifest";

interface EmptyManifestProps {
	onAdd?: (slot: SlotType, date: string) => void;
	activeDate: string;
}

const QUICK_SLOTS: { slot: SlotType; label: string; emoji: string }[] = [
	{ slot: "breakfast", label: "Breakfast", emoji: "🌅" },
	{ slot: "lunch", label: "Lunch", emoji: "☀️" },
	{ slot: "dinner", label: "Dinner", emoji: "🌙" },
];

export function EmptyManifest({ onAdd, activeDate }: EmptyManifestProps) {
	return (
		<div className="flex flex-col items-center justify-center py-16 text-center px-6">
			{/* Icon */}
			<div className="relative mb-6">
				<div className="w-20 h-20 rounded-2xl bg-hyper-green/10 flex items-center justify-center">
					<CalendarIcon className="w-10 h-10 text-hyper-green" />
				</div>
				<div className="absolute inset-0 rounded-2xl bg-hyper-green/5 scale-110 animate-pulse opacity-60" />
			</div>

			<h2 className="text-xl font-bold text-carbon mb-2">
				No meals planned yet
			</h2>

			{/* Value prop */}
			<div className="space-y-1 mb-8 max-w-xs">
				<p className="text-sm text-muted">
					Add meals from your Galley, then consume them to automatically deduct
					ingredients from Cargo.
				</p>
			</div>

			{/* Quick-start slot buttons */}
			{onAdd && (
				<div className="w-full max-w-xs space-y-2">
					<p className="text-xs text-muted uppercase tracking-widest font-mono mb-3">
						Quick-start
					</p>
					<div className="grid grid-cols-3 gap-2">
						{QUICK_SLOTS.map(({ slot, label, emoji }) => (
							<button
								key={slot}
								type="button"
								onClick={() => onAdd(slot, activeDate)}
								className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border border-dashed border-platinum hover:border-hyper-green/50 hover:bg-hyper-green/5 text-muted hover:text-hyper-green transition-all group"
							>
								<span className="text-lg leading-none">{emoji}</span>
								<span className="text-xs font-medium font-mono">{label}</span>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
