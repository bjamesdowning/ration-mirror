import { type RefObject, useEffect, useState } from "react";

export function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false);

	useEffect(() => {
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const sync = () => setReduced(media.matches);
		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
	}, []);

	return reduced;
}

export function useInView(
	ref: RefObject<Element | null>,
	threshold = 0.25,
): boolean {
	const [inView, setInView] = useState(false);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		if (!("IntersectionObserver" in window)) {
			setInView(true);
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry) setInView(entry.isIntersecting);
			},
			{ threshold },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref, threshold]);

	return inView;
}

export function useSplashPlayback(opts: {
	length: number;
	intervalMs: number;
	playing: boolean;
	reducedMotion: boolean;
}): [number, (index: number) => void] {
	const [index, setIndex] = useState(0);

	useEffect(() => {
		if (opts.reducedMotion || !opts.playing || opts.length < 2) return;
		const id = window.setInterval(() => {
			setIndex((current) => (current + 1) % opts.length);
		}, opts.intervalMs);
		return () => window.clearInterval(id);
	}, [opts.length, opts.intervalMs, opts.playing, opts.reducedMotion]);

	return [index, setIndex];
}
