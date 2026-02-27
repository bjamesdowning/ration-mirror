import { useCallback, useEffect, useRef, useState } from "react";

const STAGES = [
	{
		id: "ingest",
		num: "01",
		title: "Ingest",
		short: "Scan, import, or add items to your inventory.",
		detail:
			"Snap a photo of a receipt, import a CSV, paste a recipe URL, or key items in manually. AI extracts structure automatically — quantities, units, expiry dates — so nothing gets lost between the shop and the shelf.",
		screenshot: "/static/ration-scan-result-dark.webp",
	},
	{
		id: "cargo",
		num: "02",
		title: "Cargo",
		short: "Your inventory. Tagged, tracked, and searchable.",
		detail:
			"Every item in your kitchen lives in Cargo. Filter by domain (food, household, alcohol), tag freely, monitor expiry status, and search with semantic matching. Duplicates are detected automatically via vector embeddings — 'cherry tomatoes' and 'grape tomatoes' resolve to the same slot.",
		screenshot: "/static/ration-cargo-light.webp",
	},
	{
		id: "galley",
		num: "03",
		title: "Galley",
		short: "Meals and recipes. Matched to what you have.",
		detail:
			"The Galley holds your meals and standalone provisions. AI generates recipes from your current Cargo, or import any recipe by URL. Match Mode highlights meals you can cook right now by mapping ingredients to your inventory using vector similarity.",
		screenshot: "/static/ration-galley-light.webp",
	},
	{
		id: "manifest",
		num: "04",
		title: "Manifest",
		short: "Your weekly meal plan. Drag, schedule, consume.",
		detail:
			"The Manifest is a weekly calendar with breakfast, lunch, dinner, and snack slots. Pull meals from the Galley into specific days. When you cook, hit Consume — ingredients are automatically deducted from Cargo. Scheduled meals feed directly into your Supply list.",
		screenshot: "/static/ration-manifest-dark.webp",
	},
	{
		id: "supply",
		num: "05",
		title: "Supply",
		short: "Shopping list. Auto-generated, shareable, dockable.",
		detail:
			"Supply lists are auto-populated from selected Galley meals and your Manifest schedule. Check items off as you shop, then Dock Cargo — purchased items flow back into your inventory. The loop closes. Export as text, markdown, or CSV. Share via public link with Crew.",
		screenshot: "/static/ration-supply-dark.webp",
	},
] as const;

const AUTOPLAY_INTERVAL = 6000;

export function LifecycleStepper() {
	const [active, setActive] = useState(0);
	// Autoplay only starts after the user first interacts with this widget.
	// This prevents the page from shifting content while the user is reading.
	const [engaged, setEngaged] = useState(false);
	const [paused, setPaused] = useState(false);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const advance = useCallback(() => {
		setActive((prev) => (prev + 1) % STAGES.length);
	}, []);

	useEffect(() => {
		if (!engaged || paused) {
			if (timerRef.current) clearInterval(timerRef.current);
			return;
		}
		timerRef.current = setInterval(advance, AUTOPLAY_INTERVAL);
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, [engaged, paused, advance]);

	const handleSelect = (idx: number) => {
		setActive(idx);
		setEngaged(true);
		setPaused(true);
	};

	const handleEnter = () => {
		setEngaged(true);
		setPaused(false);
	};

	const stage = STAGES[active];
	const isRunning = engaged && !paused;

	return (
		<section
			className="w-full"
			aria-label="Lifecycle stepper"
			onMouseEnter={handleEnter}
			onMouseLeave={() => setPaused(true)}
		>
			{/* Step indicators — horizontal on desktop, vertical on mobile */}
			<div className="flex flex-col md:flex-row md:items-start gap-0 md:gap-0 mb-8">
				{STAGES.map((s, idx) => {
					const isActive = idx === active;
					const isPast = idx < active;
					return (
						<button
							key={s.id}
							type="button"
							onClick={() => handleSelect(idx)}
							className="flex md:flex-col items-center md:items-center gap-3 md:gap-2 flex-1 group text-left md:text-center relative py-3 md:py-0"
						>
							{/* Connector line (between steps) */}
							{idx > 0 && (
								<>
									{/* Vertical connector — mobile */}
									<div className="absolute left-[15px] -top-1 h-4 w-[2px] bg-carbon/10 md:hidden" />
									{/* Horizontal connector — desktop */}
									<div className="hidden md:block absolute top-[15px] right-[50%] left-[-50%] h-[2px] -z-10">
										<div
											className={`h-full transition-colors duration-300 ${isPast || isActive ? "bg-hyper-green/40" : "bg-carbon/10"}`}
										/>
									</div>
								</>
							)}
							{/* Step dot */}
							<div
								className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 ${
									isActive
										? "bg-hyper-green text-carbon scale-110"
										: isPast
											? "bg-hyper-green/20 text-hyper-green"
											: "bg-carbon/5 text-carbon/40 group-hover:bg-carbon/10"
								}`}
							>
								{s.num}
							</div>
							{/* Label */}
							<span
								className={`text-sm font-semibold transition-colors duration-300 ${
									isActive
										? "text-carbon"
										: "text-carbon/40 group-hover:text-carbon/60"
								}`}
							>
								{s.title}
							</span>
							{/* Short desc — mobile only */}
							<span className="text-xs text-muted md:hidden">{s.short}</span>
						</button>
					);
				})}
			</div>

			{/* Progress bar — always reserves height, animates only when running */}
			<div className="h-[2px] bg-carbon/5 rounded-full mb-6 overflow-hidden">
				{isRunning && (
					<div
						key={active}
						className="h-full bg-hyper-green/60 rounded-full"
						style={{
							animation: `stepper-progress ${AUTOPLAY_INTERVAL}ms linear`,
						}}
					/>
				)}
			</div>

			{/* Active stage detail */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
				<div className="space-y-4">
					<div className="flex items-center gap-3">
						<span className="text-xs font-bold text-hyper-green tracking-wider">
							STAGE {stage.num}
						</span>
						<span className="w-6 h-[2px] bg-hyper-green/40 rounded-full" />
					</div>
					<h3 className="text-display text-2xl md:text-3xl text-carbon">
						{stage.title}
					</h3>
					<p className="text-muted leading-relaxed">{stage.detail}</p>

					{/* Navigation arrows */}
					<div className="flex gap-2 pt-2">
						<button
							type="button"
							onClick={() =>
								handleSelect((active - 1 + STAGES.length) % STAGES.length)
							}
							className="w-9 h-9 rounded-lg bg-carbon/5 hover:bg-carbon/10 flex items-center justify-center transition-colors"
							aria-label="Previous stage"
						>
							<svg
								className="w-4 h-4 text-carbon"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<title>Previous</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 19l-7-7 7-7"
								/>
							</svg>
						</button>
						<button
							type="button"
							onClick={() => handleSelect((active + 1) % STAGES.length)}
							className="w-9 h-9 rounded-lg bg-carbon/5 hover:bg-carbon/10 flex items-center justify-center transition-colors"
							aria-label="Next stage"
						>
							<svg
								className="w-4 h-4 text-carbon"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<title>Next</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9 5l7 7-7 7"
								/>
							</svg>
						</button>
					</div>
				</div>

				{/* Screenshot */}
				<div className="glass-panel rounded-2xl overflow-hidden aspect-video">
					<img
						src={stage.screenshot}
						alt={`${stage.title} — Ration app screenshot`}
						className="w-full h-full object-cover object-top"
						loading="lazy"
					/>
				</div>
			</div>

			<style>{`
				@keyframes stepper-progress {
					from { width: 0%; }
					to { width: 100%; }
				}
			`}</style>
		</section>
	);
}
