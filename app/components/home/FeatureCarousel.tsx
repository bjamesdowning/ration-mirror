import { useCallback, useEffect, useRef, useState } from "react";

interface Slide {
	id: string;
	title: string;
	description: string;
	screenshotLight: string;
	screenshotDark?: string;
	badge?: string;
}

const SLIDES: Slide[] = [
	{
		id: "cargo",
		title: "Cargo Hold",
		description:
			"Your complete inventory at a glance. Filter by domain, monitor expiry, search semantically, and tag items for fast retrieval.",
		screenshotLight: "/static/ration-cargo-light.webp",
		screenshotDark: "/static/ration-cargo-dark.webp",
		badge: "Inventory",
	},
	{
		id: "galley",
		title: "Galley",
		description:
			"Meals and provisions with full ingredient breakdowns. Match Mode shows what you can cook from current Cargo using vector similarity.",
		screenshotLight: "/static/ration-galley-light.webp",
		screenshotDark: "/static/ration-galley-dark.webp",
		badge: "Recipes",
	},
	{
		id: "manifest",
		title: "Manifest",
		description:
			"Weekly meal calendar. Schedule breakfast, lunch, dinner, and snacks. Consume meals to auto-deduct ingredients from Cargo.",
		screenshotLight: "/static/ration-manifest-dark.webp",
		badge: "Meal Plan",
	},
	{
		id: "supply",
		title: "Supply List",
		description:
			"Auto-generated from your Galley selections and Manifest schedule. Check off items, then Dock Cargo to refill your inventory.",
		screenshotLight: "/static/ration-supply-dark.webp",
		badge: "Shopping",
	},
	{
		id: "scan",
		title: "AI Scanning",
		description:
			"Point your camera at a receipt or a shelf. AI extracts items, quantities, and expiry dates into structured Cargo entries.",
		screenshotLight: "/static/ration-scan-result-dark.webp",
		badge: "AI · 2 CR",
	},
	{
		id: "groups",
		title: "Crew Groups",
		description:
			"Shared inventory and meal planning for households. One subscription, multiple members, transferable credits across groups.",
		screenshotLight: "/static/ration-group-light.webp",
		screenshotDark: "/static/ration-group-dark.webp",
		badge: "Crew",
	},
];

const AUTOPLAY_MS = 5000;

export function FeatureCarousel() {
	const [current, setCurrent] = useState(0);
	// Autoplay only starts after the user first hovers over the carousel.
	// This prevents the carousel from shifting content while the user reads.
	const [engaged, setEngaged] = useState(false);
	const [paused, setPaused] = useState(false);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const goTo = useCallback((idx: number) => {
		setCurrent(((idx % SLIDES.length) + SLIDES.length) % SLIDES.length);
	}, []);

	useEffect(() => {
		if (!engaged || paused) {
			if (timerRef.current) clearInterval(timerRef.current);
			return;
		}
		timerRef.current = setInterval(() => {
			setCurrent((p) => (p + 1) % SLIDES.length);
		}, AUTOPLAY_MS);
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, [engaged, paused]);

	const slide = SLIDES[current];

	return (
		<section
			className="w-full"
			aria-label="Feature carousel"
			onMouseEnter={() => {
				setEngaged(true);
				setPaused(false);
			}}
			onMouseLeave={() => setPaused(true)}
		>
			{/* Main slide */}
			<div className="glass-panel rounded-2xl overflow-hidden">
				<div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
					{/* Screenshot — takes 3/5 on desktop */}
					<div className="lg:col-span-3 aspect-video lg:aspect-auto lg:min-h-[360px] bg-platinum/30 relative overflow-hidden">
						<picture>
							{slide.screenshotDark && (
								<source
									srcSet={slide.screenshotDark}
									media="(prefers-color-scheme: dark)"
								/>
							)}
							<img
								key={slide.id}
								src={slide.screenshotLight}
								alt={`${slide.title} screenshot`}
								className="w-full h-full object-cover object-top animate-carousel-fade"
								loading="lazy"
							/>
						</picture>
					</div>

					{/* Info panel — takes 2/5 on desktop */}
					<div className="lg:col-span-2 p-6 lg:p-8 flex flex-col justify-center gap-4">
						{slide.badge && (
							<span className="inline-block self-start text-[11px] font-bold uppercase tracking-wider bg-hyper-green/10 text-hyper-green px-2.5 py-1 rounded-full">
								{slide.badge}
							</span>
						)}
						<h3 className="text-display text-xl lg:text-2xl text-carbon">
							{slide.title}
						</h3>
						<p className="text-sm text-muted leading-relaxed">
							{slide.description}
						</p>

						{/* Nav controls */}
						<div className="flex items-center gap-3 pt-2">
							<button
								type="button"
								onClick={() => {
									goTo(current - 1);
									setEngaged(true);
									setPaused(true);
								}}
								className="w-9 h-9 rounded-lg bg-carbon/5 hover:bg-carbon/10 flex items-center justify-center transition-colors"
								aria-label="Previous slide"
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
								onClick={() => {
									goTo(current + 1);
									setEngaged(true);
									setPaused(true);
								}}
								className="w-9 h-9 rounded-lg bg-carbon/5 hover:bg-carbon/10 flex items-center justify-center transition-colors"
								aria-label="Next slide"
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
							<span className="text-xs text-muted ml-auto">
								{current + 1} / {SLIDES.length}
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* Dot indicators */}
			<div className="flex justify-center gap-2 mt-4">
				{SLIDES.map((s, idx) => (
					<button
						key={s.id}
						type="button"
						onClick={() => {
							goTo(idx);
							setEngaged(true);
							setPaused(true);
						}}
						className={`h-1.5 rounded-full transition-all duration-300 ${
							idx === current
								? "w-6 bg-hyper-green"
								: "w-1.5 bg-carbon/15 hover:bg-carbon/25"
						}`}
						aria-label={`Go to slide ${idx + 1}: ${s.title}`}
					/>
				))}
			</div>

			<style>{`
				@keyframes carousel-fade {
					from { opacity: 0; transform: scale(1.02); }
					to { opacity: 1; transform: scale(1); }
				}
				.animate-carousel-fade {
					animation: carousel-fade 400ms ease-out;
				}
			`}</style>
		</section>
	);
}
