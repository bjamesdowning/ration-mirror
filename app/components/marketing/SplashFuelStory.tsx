import { useRef } from "react";
import { Reveal } from "./Reveal";
import { useInView, usePrefersReducedMotion } from "./useSplashPlayback";

const DIAL_RADIUS = 22;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;

const macros = [
	{ id: "protein", label: "Protein", value: "96 g", percent: 0.8, delay: 0 },
	{ id: "carbs", label: "Carbs", value: "118 g", percent: 0.59, delay: 80 },
	{ id: "fat", label: "Fat", value: "41 g", percent: 0.55, delay: 160 },
] as const;

function MacroDial({
	label,
	value,
	percent,
	delay,
	active,
}: {
	label: string;
	value: string;
	percent: number;
	delay: number;
	active: boolean;
}) {
	const offset = DIAL_CIRCUMFERENCE * (1 - percent);
	return (
		<div className="splash-fuel-dial">
			<svg viewBox="0 0 56 56" role="img" aria-label={label}>
				<title>{label}</title>
				<circle className="splash-fuel-track" cx="28" cy="28" r={DIAL_RADIUS} />
				<circle
					className="splash-fuel-fill"
					cx="28"
					cy="28"
					r={DIAL_RADIUS}
					strokeDasharray={DIAL_CIRCUMFERENCE}
					strokeDashoffset={active ? offset : DIAL_CIRCUMFERENCE}
					style={{ transitionDelay: `${delay}ms` }}
				/>
			</svg>
			<strong>{label}</strong>
			<span aria-hidden>{value}</span>
		</div>
	);
}

export function SplashFuelStory() {
	const rootRef = useRef<HTMLElement | null>(null);
	const reducedMotion = usePrefersReducedMotion();
	const inView = useInView(rootRef, 0.4);
	const active = reducedMotion || inView;

	return (
		<section
			id="fuel"
			ref={rootRef}
			className="splash-section splash-fuel-section scroll-mt-24"
			aria-labelledby="fuel-heading"
		>
			<Reveal className="splash-section-heading">
				<p className="text-label text-hyper-green">Daily Fuel</p>
				<h2 id="fuel-heading">Cook for the house. Log your plate.</h2>
				<p>
					Household stock comes off the shelf when you cook. Calories and macros
					update only if you log your serving — and they stay private, even when
					the kitchen is shared. A planning aid, not medical advice.
				</p>
			</Reveal>

			<div className="splash-fuel-grid">
				<Reveal className="splash-fuel-board">
					<div className="splash-fuel-kcal">
						<p>
							<strong aria-hidden>1,240</strong>
							<span aria-hidden> / 2,000 kcal</span>
						</p>
						<div
							className="splash-os-meter splash-fuel-kcal-meter"
							data-active={active}
						>
							<span />
						</div>
						<small>From lemon chicken + yogurt bowls</small>
					</div>
					<div className="splash-fuel-dials">
						{macros.map((macro) => (
							<MacroDial
								key={macro.id}
								label={macro.label}
								value={macro.value}
								percent={macro.percent}
								delay={macro.delay}
								active={active}
							/>
						))}
					</div>
					<p className="sr-only">
						1,240 of 2,000 calories. Protein 96 grams, carbs 118 grams, fat 41
						grams.
					</p>
				</Reveal>

				<Reveal className="splash-fuel-privacy" delay={90}>
					<ol>
						<li>
							<strong>Cook</strong>
							<span>Shared. Deducts Cargo for everyone.</span>
						</li>
						<li>
							<strong>Log my serving</strong>
							<span>Private. Writes only your Daily Fuel.</span>
						</li>
						<li>
							<strong>Housemates</strong>
							<span>They see Prepared. They never see your kcal.</span>
						</li>
					</ol>
				</Reveal>
			</div>
		</section>
	);
}
