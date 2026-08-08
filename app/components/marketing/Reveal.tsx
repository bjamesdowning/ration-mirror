import {
	type CSSProperties,
	createElement,
	type ReactNode,
	useEffect,
	useRef,
} from "react";

const revealCallbacks = new Map<Element, () => void>();
let revealObserver: IntersectionObserver | null = null;

function getRevealObserver(): IntersectionObserver | null {
	if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
		return null;
	}

	revealObserver ??= new IntersectionObserver(
		(entries, observer) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				revealCallbacks.get(entry.target)?.();
				revealCallbacks.delete(entry.target);
				observer.unobserve(entry.target);
			}
		},
		{ threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
	);

	return revealObserver;
}

type RevealProps = {
	as?: "article" | "div" | "section";
	children: ReactNode;
	className?: string;
	delay?: number;
	id?: string;
	"aria-labelledby"?: string;
};

export function Reveal({
	as = "div",
	children,
	className = "",
	delay = 0,
	id,
	"aria-labelledby": ariaLabelledby,
}: RevealProps) {
	const elementRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const element = elementRef.current;
		if (!element) return;

		const observer = getRevealObserver();
		const reducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		if (!observer || reducedMotion) {
			element.dataset.revealed = "true";
			return;
		}

		element.classList.add("splash-reveal-ready");
		revealCallbacks.set(element, () => {
			element.dataset.revealed = "true";
		});
		observer.observe(element);

		return () => {
			revealCallbacks.delete(element);
			observer.unobserve(element);
		};
	}, []);

	return createElement(
		as,
		{
			ref: elementRef,
			id,
			"aria-labelledby": ariaLabelledby,
			className: `splash-reveal ${className}`.trim(),
			style: { "--reveal-delay": `${delay}ms` } as CSSProperties,
		},
		children,
	);
}
