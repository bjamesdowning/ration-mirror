import { Link } from "react-router";

/** In-page Crew gate for a full Fuel day. Same copy as the Fuel page. */
export function CrewFuelLimitDialog({
	titleId,
	onClose,
}: {
	titleId: string;
	onClose: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-[90] flex items-end justify-center bg-carbon/40 p-4 sm:items-center"
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
		>
			<div className="w-full max-w-md space-y-4 rounded-2xl bg-ceramic p-6 shadow-glow">
				<h2 id={titleId} className="text-xl font-semibold text-carbon">
					Crew
				</h2>
				<p className="text-sm text-carbon">
					This date already has 3 Fuel logs. Crew removes the daily limit.
				</p>
				<div className="flex flex-wrap gap-3">
					<Link
						to="/hub/pricing"
						className="inline-flex min-h-11 items-center rounded-xl bg-carbon px-4 text-ceramic"
					>
						See Crew
					</Link>
					<button
						type="button"
						className="min-h-11 rounded-xl border border-platinum px-4"
						onClick={onClose}
					>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
