import { useRef } from "react";
import { HERO_BEAT_MS, HERO_BEATS } from "~/lib/splash-story";
import { SplashKitchenScreen, SplashPhone } from "./SplashKitchenScreen";
import {
	useInView,
	usePrefersReducedMotion,
	useSplashPlayback,
} from "./useSplashPlayback";

export function SplashHeroCanvas() {
	const rootRef = useRef<HTMLDivElement>(null);
	const reducedMotion = usePrefersReducedMotion();
	const inView = useInView(rootRef, 0.35);
	const [beatIndex] = useSplashPlayback({
		length: HERO_BEATS.length,
		intervalMs: HERO_BEAT_MS,
		playing: inView,
		reducedMotion,
	});
	const activeIndex = reducedMotion ? HERO_BEATS.length - 1 : beatIndex;
	const beat = HERO_BEATS[activeIndex] ?? HERO_BEATS[0];

	return (
		<div ref={rootRef} className="splash-hero-canvas">
			<SplashPhone>
				<SplashKitchenScreen beat={beat.id} />
			</SplashPhone>
			<p className="splash-hero-canvas-caption" aria-hidden="true">
				<span className="splash-status-dot" />
				{beat.label}
			</p>
			<p className="sr-only">
				Product walkthrough: scan food in, check the pantry, pick a meal, plan
				the week, shop the gaps, cook, then log your serving for calories and
				macros.
			</p>
			<ol className="splash-hero-beats" aria-hidden>
				{HERO_BEATS.map((item, index) => (
					<li key={item.id} data-active={index === activeIndex} />
				))}
			</ol>
		</div>
	);
}
