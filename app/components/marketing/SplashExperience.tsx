import {
	ArrowDown,
	ArrowRight,
	CalendarDays,
	CookingPot,
	Database,
	PackageSearch,
	ScanLine,
	ShieldCheck,
	ShoppingBasket,
	Smartphone,
	Sparkles,
	Users,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

const loopStages = [
	{
		id: "cargo",
		number: "01",
		title: "Cargo",
		verb: "Know what you have.",
		detail: "Quantities, expiry and semantic ingredient memory.",
		icon: PackageSearch,
		signal: "18 items ready · 3 expiring soon",
	},
	{
		id: "galley",
		number: "02",
		title: "Galley",
		verb: "See what is possible.",
		detail: "Recipes match against the food already in your kitchen.",
		icon: CookingPot,
		signal: "6 meals available now",
	},
	{
		id: "manifest",
		number: "03",
		title: "Manifest",
		verb: "Turn intent into a plan.",
		detail: "Build a week around preferences, time and real stock.",
		icon: CalendarDays,
		signal: "5 dinners planned",
	},
	{
		id: "supply",
		number: "04",
		title: "Supply",
		verb: "Buy only the delta.",
		detail: "Missing ingredients become one practical shopping list.",
		icon: ShoppingBasket,
		signal: "11 missing items consolidated",
	},
	{
		id: "dock",
		number: "05",
		title: "Dock",
		verb: "Close the loop.",
		detail: "Purchased food returns to Cargo; cooked meals deduct stock.",
		icon: ArrowDown,
		signal: "Cargo updated automatically",
	},
] as const;

const capabilities = [
	{
		label: "Semantic memory",
		value: "Understands ingredients, not just exact words",
		icon: Database,
	},
	{
		label: "Fast intake",
		value: "Photo, receipt, URL or manual entry",
		icon: ScanLine,
	},
	{
		label: "Shared households",
		value: "One live system for the whole crew",
		icon: Users,
	},
	{
		label: "Scoped by design",
		value: "OAuth permissions, revocable access, full export",
		icon: ShieldCheck,
	},
] as const;

function LoopDiagram({ activeIndex }: { activeIndex: number }) {
	return (
		<figure
			className="splash-loop-visual"
			data-active-stage={loopStages[activeIndex]?.id}
		>
			<figcaption className="sr-only">
				Closed pantry loop. Active stage: {loopStages[activeIndex]?.title}
			</figcaption>
			<div className="splash-orbit" aria-hidden>
				<svg viewBox="0 0 420 420" role="presentation">
					<path
						className="splash-orbit-track"
						d="M210 38 L374 157 L311 350 L109 350 L46 157 Z"
					/>
					<path
						className="splash-orbit-flow"
						d="M210 38 L374 157 L311 350 L109 350 L46 157 Z"
					/>
				</svg>
				<div className="splash-orbit-core">
					<span>Ration</span>
					<small>one live kitchen</small>
				</div>
				{loopStages.map((stage, index) => {
					const Icon = stage.icon;
					return (
						<div
							key={stage.id}
							className="splash-orbit-node"
							data-position={index}
							data-active={index === activeIndex}
						>
							<Icon aria-hidden size={20} />
							<span>{stage.title}</span>
						</div>
					);
				})}
			</div>
			<div className="splash-stage-readout" aria-live="polite">
				<span>{loopStages[activeIndex]?.signal}</span>
				<div className="splash-scan-line" aria-hidden />
			</div>
		</figure>
	);
}

function ClosedLoopStory() {
	const [activeIndex, setActiveIndex] = useState(0);
	const stageRefs = useRef<Array<HTMLElement | null>>([]);

	useEffect(() => {
		if (!("IntersectionObserver" in window)) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
				const index = visible?.target.getAttribute("data-stage-index");
				if (index !== undefined && index !== null)
					setActiveIndex(Number(index));
			},
			{ rootMargin: "-30% 0px -45% 0px", threshold: [0.15, 0.5, 0.8] },
		);

		for (const stage of stageRefs.current) {
			if (stage) observer.observe(stage);
		}
		return () => observer.disconnect();
	}, []);

	return (
		<section
			id="how-it-works"
			className="splash-section scroll-mt-24"
			aria-labelledby="loop-heading"
		>
			<div className="splash-section-heading">
				<p className="text-label text-hyper-green">The full loop</p>
				<h2 id="loop-heading">A pantry that keeps its own context.</h2>
				<p>Plan, shop and cook without rebuilding the truth every time.</p>
			</div>
			<div className="splash-story-grid">
				<div className="splash-story-copy">
					{loopStages.map((stage, index) => {
						const Icon = stage.icon;
						return (
							<article
								key={stage.id}
								ref={(node) => {
									stageRefs.current[index] = node;
								}}
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
				<div className="splash-story-sticky">
					<LoopDiagram activeIndex={activeIndex} />
				</div>
			</div>
		</section>
	);
}

function HeroSystem() {
	return (
		<figure className="splash-hero-system">
			<figcaption className="sr-only">
				Ration reads pantry inventory, matches meals, and updates the shopping
				list.
			</figcaption>
			<div className="splash-system-bar">
				<span className="splash-status-dot" />
				<span>Kitchen online</span>
				<small>live context</small>
			</div>
			<div className="splash-system-query">
				<span className="text-hyper-green">Ask Ration</span>
				<p>Plan three dinners and buy only what is missing.</p>
			</div>
			<div className="splash-system-events">
				<div style={{ "--event-delay": "0s" } as CSSProperties}>
					<span>01</span>
					<p>read Cargo</p>
					<strong>18 items</strong>
				</div>
				<div style={{ "--event-delay": "0.7s" } as CSSProperties}>
					<span>02</span>
					<p>match Galley</p>
					<strong>6 meals</strong>
				</div>
				<div style={{ "--event-delay": "1.4s" } as CSSProperties}>
					<span>03</span>
					<p>sync Supply</p>
					<strong>11 items</strong>
				</div>
			</div>
			<div className="splash-system-result">
				<Sparkles aria-hidden size={17} />
				<span>Manifest ready. Supply contains only the delta.</span>
			</div>
		</figure>
	);
}

function ControlModes() {
	return (
		<section
			id="control"
			className="splash-section scroll-mt-24"
			aria-labelledby="control-heading"
		>
			<div className="splash-section-heading centered">
				<p className="text-label text-hyper-green">Two control surfaces</p>
				<h2 id="control-heading">Ask inside Ration. Or bring your own AI.</h2>
				<p>
					Both operate the same live Cargo, Galley, Manifest and Supply data.
				</p>
			</div>
			<div className="splash-control-grid">
				<article className="splash-control-card splash-copilot-card">
					<div className="splash-control-label">
						<span className="splash-status-dot" />
						<span>Ration Copilot</span>
						<small>Live</small>
					</div>
					<div className="splash-chat">
						<p>What should I use first?</p>
						<div>
							<Sparkles aria-hidden size={16} />
							<span>
								Cook the spinach curry tonight. It uses three items expiring
								this week.
							</span>
						</div>
					</div>
					<h3>Your kitchen assistant, built in.</h3>
					<p>
						Plan meals, inspect stock and update the loop without leaving
						Ration.
					</p>
				</article>
				<article className="splash-control-card splash-mcp-card">
					<div className="splash-control-label">
						<span className="splash-status-dot" />
						<span>MCP control</span>
						<small>OAuth 2.1</small>
					</div>
					<section
						className="splash-terminal"
						aria-label="MCP tool call example"
					>
						<p>
							<span>assistant</span> use what expires next
						</p>
						<p>
							<span>tool</span> match_meals
						</p>
						<p>
							<span>result</span> 6 cookable · 2 urgent
						</p>
					</section>
					<h3>Your pantry, inside your AI.</h3>
					<p>
						Connect Claude, ChatGPT, Cursor or any compatible client with one
						MCP URL.
					</p>
					<Link to="/connect" className="splash-inline-link">
						Connect an AI agent <ArrowRight aria-hidden size={15} />
					</Link>
				</article>
			</div>
		</section>
	);
}

function CapabilityProof() {
	return (
		<section className="splash-capabilities" aria-label="Core capabilities">
			{capabilities.map((capability) => {
				const Icon = capability.icon;
				return (
					<div key={capability.label}>
						<Icon aria-hidden size={20} />
						<span>
							<strong>{capability.label}</strong>
							<small>{capability.value}</small>
						</span>
					</div>
				);
			})}
		</section>
	);
}

function IosPreview() {
	return (
		<section
			id="ios"
			className="splash-ios scroll-mt-24"
			aria-labelledby="ios-heading"
		>
			<div className="splash-phone" aria-hidden>
				<div className="splash-phone-island" />
				<div className="splash-phone-screen">
					<div>
						<span className="splash-status-dot" />
						<small>Ration for iPhone</small>
					</div>
					<Smartphone size={46} />
					<strong>Your kitchen. In your pocket.</strong>
					<span>Cargo · Ask · Manifest · Supply</span>
				</div>
			</div>
			<div className="splash-ios-copy">
				<p className="text-label text-hyper-green">Ration for iOS</p>
				<h2 id="ios-heading">The full loop, wherever dinner happens.</h2>
				<p>
					Native pantry control, Copilot and live household sync are coming to
					iPhone.
				</p>
				<span
					className="splash-coming-soon"
					role="status"
					aria-label="iOS app coming soon"
				>
					<Smartphone aria-hidden size={19} />
					<span>
						<small>iOS app</small>
						Coming soon
					</span>
				</span>
			</div>
		</section>
	);
}

export function SplashExperience() {
	return (
		<>
			<section className="splash-hero" aria-labelledby="splash-title">
				<div className="splash-hero-copy">
					<div className="splash-kicker">
						<span className="splash-status-dot" />
						AI pantry management · MCP native
					</div>
					<h1 id="splash-title">Your kitchen, operable by AI.</h1>
					<p>
						Ration keeps pantry inventory, meals, plans and shopping in one
						closed loop—controlled by Copilot or any MCP-compatible assistant.
					</p>
					<div className="splash-hero-actions">
						<a href="#signup" className="splash-primary-cta">
							Start free <ArrowRight aria-hidden size={17} />
						</a>
						<Link to="/connect" className="splash-secondary-cta">
							Connect an AI agent
						</Link>
					</div>
					<a href="#how-it-works" className="splash-scroll-cue">
						See the full loop <ArrowDown aria-hidden size={15} />
					</a>
				</div>
				<HeroSystem />
			</section>
			<ClosedLoopStory />
			<ControlModes />
			<CapabilityProof />
			<IosPreview />
		</>
	);
}
