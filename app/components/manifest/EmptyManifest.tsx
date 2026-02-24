import { CalendarIcon } from "~/components/icons/PageIcons";

interface EmptyManifestProps {
	onAddFirst?: () => void;
}

export function EmptyManifest({ onAddFirst }: EmptyManifestProps) {
	return (
		<div className="flex flex-col items-center justify-center py-20 text-center px-6">
			<div className="w-16 h-16 rounded-2xl bg-hyper-green/10 flex items-center justify-center mb-4">
				<CalendarIcon className="w-8 h-8 text-hyper-green" />
			</div>
			<h2 className="text-xl font-bold text-carbon mb-2">
				No meals planned yet
			</h2>
			<p className="text-sm text-muted max-w-xs mb-6">
				Tap the <span className="font-semibold text-carbon">+</span> button on
				any meal slot to start building this week's plan from your Galley.
			</p>
			{onAddFirst && (
				<button
					type="button"
					onClick={onAddFirst}
					className="px-5 py-2.5 bg-hyper-green text-carbon font-semibold rounded-xl shadow-glow-sm hover:shadow-glow transition-all text-sm"
				>
					Plan today
				</button>
			)}
		</div>
	);
}
