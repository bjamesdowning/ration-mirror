import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_STORE_URL } from "~/lib/marketing";

export function SplashStickyCta({
	heroSelector = ".splash-hero",
	hideSelector = "#signup",
	loopSelector = "#how-it-works",
}: {
	heroSelector?: string;
	hideSelector?: string;
	loopSelector?: string;
}) {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (!("IntersectionObserver" in window)) return;

		const media = window.matchMedia("(max-width: 900px)");
		let observer: IntersectionObserver | undefined;

		const attach = () => {
			observer?.disconnect();
			observer = undefined;
			if (!media.matches) {
				setVisible(false);
				return;
			}

			const hero = document.querySelector(heroSelector);
			const hide = document.querySelector(hideSelector);
			const loop = document.querySelector(loopSelector);
			if (!hero) return;

			let heroGone = false;
			let signupVisible = false;
			let loopVisible = false;
			const sync = () => setVisible(heroGone && !signupVisible && !loopVisible);

			observer = new IntersectionObserver((entries) => {
				for (const entry of entries) {
					if (entry.target === hero) heroGone = !entry.isIntersecting;
					if (hide && entry.target === hide) {
						signupVisible = entry.isIntersecting;
					}
					if (loop && entry.target === loop) {
						loopVisible = entry.isIntersecting;
					}
				}
				sync();
			});

			observer.observe(hero);
			if (hide) observer.observe(hide);
			if (loop) observer.observe(loop);
		};

		attach();
		media.addEventListener("change", attach);
		return () => {
			media.removeEventListener("change", attach);
			observer?.disconnect();
		};
	}, [heroSelector, hideSelector, loopSelector]);

	if (!visible) return null;

	return (
		<div className="splash-sticky-cta">
			<a
				href={APP_STORE_URL}
				className="splash-primary-cta"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Get Ration on the App Store"
			>
				Get the app <ArrowRight aria-hidden size={16} />
			</a>
			<a href="#signup" className="splash-sticky-web">
				Start free
			</a>
		</div>
	);
}
