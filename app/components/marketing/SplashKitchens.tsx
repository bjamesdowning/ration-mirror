import { useRef } from "react";
import { Reveal } from "./Reveal";
import {
	useInView,
	usePrefersReducedMotion,
	useSplashPlayback,
} from "./useSplashPlayback";

const kitchens = [
	{
		id: "home",
		name: "Home",
		role: "Family kitchen",
		items: ["Chicken thigh", "Greek yogurt", "Baby spinach"],
	},
	{
		id: "share",
		name: "Sharehouse",
		role: "Second place you cook",
		items: ["Passata", "Pasta", "Basil"],
	},
] as const;

export function SplashKitchens() {
	const rootRef = useRef<HTMLElement | null>(null);
	const reducedMotion = usePrefersReducedMotion();
	const inView = useInView(rootRef, 0.35);
	const [index, setIndex] = useSplashPlayback({
		length: kitchens.length,
		intervalMs: 4200,
		playing: inView,
		reducedMotion,
	});
	const kitchen = kitchens[index] ?? kitchens[0];

	return (
		<section
			id="kitchens"
			ref={rootRef}
			className="splash-section splash-kitchens-section scroll-mt-24"
			aria-labelledby="kitchens-heading"
		>
			<Reveal className="splash-section-heading">
				<p className="text-label text-hyper-green">More than one kitchen</p>
				<h2 id="kitchens-heading">
					Home, a sharehouse, a second place you cook.
				</h2>
				<p>
					Switch kitchens when you walk in the door. Pantry, recipes, plan, and
					shopping list stay in sync for that kitchen. Credits sit on the
					kitchen. Your Daily Fuel stays yours. Free includes one owned kitchen;
					Crew Member unlocks invites and up to five.
				</p>
			</Reveal>

			<div className="splash-kitchens-board">
				<fieldset className="splash-kitchen-switch">
					<legend className="sr-only">Kitchens</legend>
					{kitchens.map((item, kitchenIndex) => (
						<button
							key={item.id}
							type="button"
							aria-pressed={index === kitchenIndex}
							data-active={index === kitchenIndex}
							onClick={() => setIndex(kitchenIndex)}
						>
							{item.name}
						</button>
					))}
				</fieldset>

				<div className="splash-kitchen-panel" data-kitchen={kitchen.id}>
					<div>
						<p className="splash-kitchen-name">{kitchen.name}</p>
						<p className="splash-kitchen-role">{kitchen.role}</p>
						<ul>
							{kitchen.items.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>
					<aside>
						<span>Daily Fuel</span>
						<strong>Only you</strong>
						<small>1,240 kcal stays on your account, in every kitchen.</small>
					</aside>
				</div>
			</div>
		</section>
	);
}
