import { CalendarIcon } from "~/components/icons/PageIcons";
import type { SlotType } from "~/lib/schemas/manifest";

interface EmptyManifestProps {
	onAdd?: (slot: SlotType, date: string) => void;
	activeDate: string;
}

function EggIcon({ className = "w-5 h-5" }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			aria-hidden="true"
		>
			<title>Egg</title>
			{/* Egg shell */}
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.75}
				d="M12 3C8.5 3 5.5 7 5.5 12c0 3.6 2.9 6.5 6.5 6.5s6.5-2.9 6.5-6.5C18.5 7 15.5 3 12 3z"
			/>
			{/* Yolk circle */}
			<circle cx="12" cy="12.5" r="2.25" strokeWidth={1.75} />
		</svg>
	);
}

function SandwichIcon({ className = "w-5 h-5" }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			aria-hidden="true"
		>
			<title>Sandwich</title>
			{/* Top bun */}
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.75}
				d="M4 9.5C4 7 7.6 5 12 5s8 2 8 4.5H4z"
			/>
			{/* Lettuce layer */}
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.75}
				d="M3 11.5h18"
			/>
			{/* Filling layer */}
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.75}
				d="M3 13.5h18"
			/>
			{/* Bottom bun */}
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.75}
				d="M4 15.5h16a1 1 0 010 2H4a1 1 0 010-2z"
			/>
		</svg>
	);
}

function ChickenLegIcon({ className = "w-5 h-5" }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			aria-hidden="true"
		>
			<title>Chicken leg</title>
			{/* Drumstick head (meat) */}
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.75}
				d="M14 4a5 5 0 11-4 8l-5.5 5.5a1.5 1.5 0 002.1 2.1L12 14a5 5 0 002 0"
			/>
			{/* Bone end knob */}
			<circle cx="7" cy="17" r="1.25" strokeWidth={1.75} />
		</svg>
	);
}

const QUICK_SLOTS: {
	slot: SlotType;
	label: string;
	Icon: (props: { className?: string }) => React.ReactElement;
}[] = [
	{ slot: "breakfast", label: "Breakfast", Icon: EggIcon },
	{ slot: "lunch", label: "Lunch", Icon: SandwichIcon },
	{ slot: "dinner", label: "Dinner", Icon: ChickenLegIcon },
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
						{QUICK_SLOTS.map(({ slot, label, Icon }) => (
							<button
								key={slot}
								type="button"
								onClick={() => onAdd(slot, activeDate)}
								className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border border-dashed border-platinum hover:border-hyper-green/50 hover:bg-hyper-green/5 text-muted hover:text-hyper-green transition-all group"
							>
								<Icon className="w-5 h-5" />
								<span className="text-xs font-medium font-mono">{label}</span>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
