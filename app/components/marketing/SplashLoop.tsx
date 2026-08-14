import {
	ArrowDown,
	CalendarDays,
	CookingPot,
	PackageSearch,
	ShoppingBasket,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LOOP_STAGES, stageShowsFuel } from "~/lib/splash-story";
import { Reveal } from "./Reveal";
import { SplashKitchenScreen, SplashPhone } from "./SplashKitchenScreen";

const COMPACT_QUERY = "(max-width: 900px)";

const stageIcons = {
	cargo: PackageSearch,
	galley: CookingPot,
	manifest: CalendarDays,
	supply: ShoppingBasket,
	dock: ArrowDown,
} as const;

export function SplashLoop() {
	const [activeIndex, setActiveIndex] = useState(0);
	const [isCompact, setIsCompact] = useState(false);
	const stageRefs = useRef<Array<HTMLElement | null>>([]);
	const active = LOOP_STAGES[activeIndex] ?? LOOP_STAGES[0];

	useEffect(() => {
		const media = window.matchMedia(COMPACT_QUERY);
		const sync = () => setIsCompact(media.matches);
		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
	}, []);

	useEffect(() => {
		if (isCompact || !("IntersectionObserver" in window)) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
				const index = visible?.target.getAttribute("data-stage-index");
				if (index !== undefined && index !== null) {
					setActiveIndex(Number(index));
				}
			},
			{
				rootMargin: "-30% 0px -45% 0px",
				threshold: [0.15, 0.5, 0.8],
			},
		);

		for (const stage of stageRefs.current) {
			if (stage) observer.observe(stage);
		}
		return () => observer.disconnect();
	}, [isCompact]);

	const selectStage = (index: number) => {
		if (window.matchMedia(COMPACT_QUERY).matches) {
			setActiveIndex(index);
			return;
		}
		stageRefs.current[index]?.scrollIntoView({
			behavior: "smooth",
			block: "center",
		});
	};

	return (
		<section
			id="how-it-works"
			className="splash-section scroll-mt-24"
			aria-labelledby="loop-heading"
		>
			<Reveal className="splash-section-heading">
				<p className="text-label text-hyper-green">How it works</p>
				<h2 id="loop-heading">
					One loop: Cargo → Galley → Manifest → Supply → Dock
				</h2>
				<p>
					Cook a meal and stock deducts. Log your serving and Daily Fuel updates
					privately. Buy groceries and Cargo updates. Nothing is retyped.
				</p>
			</Reveal>

			<fieldset className="splash-loop-rail">
				<legend className="sr-only">Kitchen loop</legend>
				{LOOP_STAGES.map((stage, index) => (
					<button
						key={stage.id}
						type="button"
						aria-current={activeIndex === index}
						data-active={activeIndex === index}
						onClick={() => selectStage(index)}
					>
						{stage.number} {stage.title}
					</button>
				))}
			</fieldset>

			<div className="splash-story-grid">
				<div className="splash-story-sticky">
					<div className="splash-loop-stage" data-active-stage={active.id}>
						<SplashPhone compact>
							<SplashKitchenScreen stage={active.id} />
						</SplashPhone>
						<div className="splash-stage-readout" aria-live="polite">
							<span>{active.signal}</span>
							{stageShowsFuel(active.id) ? (
								<small>Daily Fuel · only you</small>
							) : (
								<small>Shared kitchen</small>
							)}
							<div className="splash-scan-line" aria-hidden />
						</div>
					</div>
				</div>
				<div className="splash-story-copy">
					{LOOP_STAGES.map((stage, index) => {
						const Icon = stageIcons[stage.id];
						return (
							<article
								key={stage.id}
								ref={(node) => {
									stageRefs.current[index] = node;
								}}
								hidden={isCompact && activeIndex !== index}
								data-stage-index={index}
								data-active={activeIndex === index}
								className="splash-story-step"
							>
								<div className="splash-step-index">
									<span>{stage.number}</span>
									<Icon aria-hidden size={18} />
								</div>
								<h3>{stage.title}</h3>
								<p className="splash-step-verb">{stage.verb}</p>
								<p>{stage.detail}</p>
							</article>
						);
					})}
				</div>
			</div>
		</section>
	);
}
