/**
 * Lightweight zero-dependency canvas confetti.
 * Brand palette: Hyper-Green, Ceramic, Platinum.
 * Self-removes from DOM after ~2.5s.
 */

const COLOURS = ["#00E088", "#F8F9FA", "#E6E6E6", "#00c070", "#ffffff"];
const PARTICLE_COUNT = 90;
const DURATION_MS = 2500;

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	angle: number;
	spin: number;
	size: number;
	colour: string;
	alpha: number;
}

function createParticle(canvasWidth: number): Particle {
	return {
		x: canvasWidth * (0.3 + Math.random() * 0.4),
		y: -10,
		vx: (Math.random() - 0.5) * 6,
		vy: Math.random() * 4 + 2,
		angle: Math.random() * Math.PI * 2,
		spin: (Math.random() - 0.5) * 0.3,
		size: Math.random() * 8 + 4,
		colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
		alpha: 1,
	};
}

export function fireConfetti() {
	const canvas = document.createElement("canvas");
	canvas.style.cssText =
		"position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	document.body.appendChild(canvas);

	const rawCtx = canvas.getContext("2d");
	if (!rawCtx) {
		canvas.remove();
		return;
	}
	// Alias to a non-nullable reference so TypeScript is happy inside the draw closure
	const ctx: CanvasRenderingContext2D = rawCtx;

	const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () =>
		createParticle(canvas.width),
	);

	const startTime = performance.now();
	let rafId: number;

	function draw(now: number) {
		const elapsed = now - startTime;
		const progress = Math.min(elapsed / DURATION_MS, 1);

		ctx.clearRect(0, 0, canvas.width, canvas.height);

		for (const p of particles) {
			p.x += p.vx;
			p.y += p.vy;
			p.vy += 0.12; // gravity
			p.angle += p.spin;
			p.alpha = Math.max(0, 1 - progress * 1.4);

			ctx.save();
			ctx.globalAlpha = p.alpha;
			ctx.translate(p.x, p.y);
			ctx.rotate(p.angle);
			ctx.fillStyle = p.colour;
			ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
			ctx.restore();
		}

		if (progress < 1) {
			rafId = requestAnimationFrame(draw);
		} else {
			canvas.remove();
		}
	}

	rafId = requestAnimationFrame(draw);

	// Safety: ensure canvas is removed even if tab loses focus
	setTimeout(() => {
		cancelAnimationFrame(rafId);
		canvas.remove();
	}, DURATION_MS + 200);
}
