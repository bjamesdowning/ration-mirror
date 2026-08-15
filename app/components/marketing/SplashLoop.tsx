import {
	ArrowDown,
	CalendarDays,
	CookingPot,
	PackageSearch,
	ShoppingBasket,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	LOOP_STAGES,
	type LoopStageId,
	stageShowsFuel,
} from "~/lib/splash-story";
import { Reveal } from "./Reveal";
import {
	SplashKitchenScreen,
	SplashPhone,
	SplashStageCanvas,
} from "./SplashKitchenScreen";
import { usePrefersReducedMotion } from "./useSplashPlayback";

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
	const reducedMotion = usePrefersReducedMotion();
	const active = LOOP_STAGES[activeIndex] ?? LOOP_STAGES[0];

	useEffect(() => {
		const media = window.matchMedia(COMPACT_QUERY);
		const sync = () => setIsCompact(media.matches);
		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
	}, []);

	useEffect(() => {
		if (!("IntersectionObserver" in window)) return;
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
			isCompact
				? {
						rootMargin: "-35% 0px -35% 0px",
						threshold: [0.25, 0.5, 0.75],
					}
				: {
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
		setActiveIndex(index);
		const compact = window.matchMedia(COMPACT_QUERY).matches;
		stageRefs.current[index]?.scrollIntoView({
			behavior: reducedMotion ? "auto" : "smooth",
			block: compact ? "start" : "center",
		});
	};

	return (
		<section
			id="how-it-works"
			className="splash-section splash-loop scroll-mt-24"
			aria-labelledby="loop-heading"
		>
			<Reveal className="splash-section-heading splash-loop-intro">
				<p className="text-label text-hyper-green">How it works</p>
				<h2 id="loop-heading">
					One loop: Cargo → Galley → Manifest → Supply → Dock
				</h2>
				<p>
					Cook a meal and stock deducts. Log your serving and Daily Fuel updates
					privately. Buy groceries and Cargo updates. Nothing is retyped.
				</p>
			</Reveal>

			<nav className="splash-loop-hud" aria-label="Kitchen loop progress">
				<p>
					<span className="text-label text-hyper-green">How it works</span>
					<span aria-hidden>·</span>
					<span>
						{active.number} {active.title}
					</span>
				</p>
				<fieldset className="splash-loop-progress">
					<legend className="sr-only">Kitchen loop stages</legend>
					{LOOP_STAGES.map((stage, index) => (
						<button
							key={stage.id}
							type="button"
							aria-label={`${stage.number} ${stage.title}`}
							aria-current={activeIndex === index ? true : undefined}
							data-active={activeIndex === index}
							data-complete={index <= activeIndex}
							onClick={() => selectStage(index)}
						/>
					))}
				</fieldset>
			</nav>

			<div className="splash-story-grid">
				<div className="splash-story-sticky">
					<div className="splash-loop-stage" data-active-stage={active.id}>
						<SplashPhone compact>
							<SplashKitchenScreen stage={active.id} />
						</SplashPhone>
						<StageReadout live stageId={active.id} signal={active.signal} />
					</div>
				</div>
				<div className="splash-story-copy">
					{LOOP_STAGES.map((stage, index) => {
						const Icon = stageIcons[stage.id];
						const isLast = index === LOOP_STAGES.length - 1;
						return (
							<article
								key={stage.id}
								ref={(node) => {
									stageRefs.current[index] = node;
								}}
								data-stage-index={index}
								data-active={activeIndex === index}
								className="splash-story-step splash-loop-panel"
							>
								<div className="splash-step-index">
									<span>{stage.number}</span>
									<Icon aria-hidden size={18} />
								</div>
								<h3>{stage.title}</h3>
								<p className="splash-step-verb">{stage.verb}</p>
								<p className="splash-step-detail">{stage.detail}</p>
								<div className="splash-loop-panel-demo">
									<SplashStageCanvas>
										<SplashKitchenScreen stage={stage.id} />
									</SplashStageCanvas>
									<StageReadout stageId={stage.id} signal={stage.signal} />
									{isLast ? null : (
										<p className="splash-loop-next-cue">
											<span className="sr-only">Scroll to the next stage</span>
											<ArrowDown aria-hidden size={18} />
										</p>
									)}
								</div>
							</article>
						);
					})}
				</div>
			</div>
		</section>
	);
}

function StageReadout({
	stageId,
	signal,
	live = false,
}: {
	stageId: LoopStageId;
	signal: string;
	live?: boolean;
}) {
	return (
		<div
			className="splash-stage-readout"
			aria-live={live ? "polite" : undefined}
		>
			<span>{signal}</span>
			{stageShowsFuel(stageId) ? (
				<small>Daily Fuel · only you</small>
			) : (
				<small>Shared kitchen</small>
			)}
			<div className="splash-scan-line" aria-hidden />
		</div>
	);
}
