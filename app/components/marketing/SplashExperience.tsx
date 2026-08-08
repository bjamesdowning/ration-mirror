import {
	ArrowDown,
	ArrowRight,
	CalendarDays,
	CookingPot,
	Database,
	ExternalLink,
	PackageSearch,
	ScanLine,
	ShieldCheck,
	ShoppingBasket,
	Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
	APP_STORE_URL,
	HELP_DOCS_URL,
	YOUTUBE_CHANNEL_URL,
} from "~/lib/marketing";
import { ExplainerVideo } from "./ExplainerVideo";
import { Reveal } from "./Reveal";

const loopStages = [
	{
		id: "cargo",
		number: "01",
		title: "Cargo",
		verb: "Know what you have.",
		detail: "Track quantity and expiry in one live inventory.",
		icon: PackageSearch,
		signal: "18 items ready · 3 expiring soon",
	},
	{
		id: "galley",
		number: "02",
		title: "Galley",
		verb: "See what you can cook.",
		detail: "Match recipes against the food already at home.",
		icon: CookingPot,
		signal: "6 meals available now",
	},
	{
		id: "manifest",
		number: "03",
		title: "Manifest",
		verb: "Plan the week.",
		detail: "Schedule meals around your time and real stock.",
		icon: CalendarDays,
		signal: "5 dinners planned",
	},
	{
		id: "supply",
		number: "04",
		title: "Supply",
		verb: "Buy only the gaps.",
		detail: "Turn missing ingredients into one shopping list.",
		icon: ShoppingBasket,
		signal: "11 missing items consolidated",
	},
	{
		id: "dock",
		number: "05",
		title: "Dock",
		verb: "Close the loop.",
		detail: "Add purchases to Cargo and deduct what you cook.",
		icon: ArrowDown,
		signal: "Cargo updated automatically",
	},
] as const;

const whyCards = [
	{
		title: "Bought it twice",
		body: "Check Cargo before you shop, wherever you are.",
	},
	{
		title: "Expired in the drawer",
		body: "See what expires next and find meals that use it.",
	},
	{
		title: "What's for dinner, again",
		body: "Ask Ration and get an answer grounded in your actual food.",
	},
] as const;

const capabilities = [
	{
		label: "Ingredient-aware matching",
		value: "Finds the same food even when the wording differs.",
		icon: Database,
	},
	{
		label: "Fast intake",
		value: "Add food from a photo, receipt, recipe URL, or by hand.",
		icon: ScanLine,
	},
	{
		label: "One household record",
		value: "Everyone in your crew sees the same live kitchen.",
		icon: Users,
	},
	{
		label: "Access you control",
		value: "OAuth scopes, revocable agents, and full data export.",
		icon: ShieldCheck,
	},
] as const;

const proofShots = [
	{
		src: "/static/landing/cargo.png",
		alt: "Ration Cargo inventory on iPhone",
		caption: "Know your stock before it spoils",
	},
	{
		src: "/static/landing/manifest.png",
		alt: "Ration weekly Manifest on iPhone",
		caption: "Plan the week. Keep the crew aligned",
	},
	{
		src: "/static/landing/supply.png",
		alt: "Ration Supply shopping list on iPhone",
		caption: "Shop only what you're still missing",
	},
] as const;

function LoopDiagram({ activeIndex }: { activeIndex: number }) {
	return (
		<figure
			className="splash-loop-visual"
			data-active-stage={loopStages[activeIndex]?.id}
		>
			<figcaption className="sr-only">
				Closed kitchen loop. Active stage: {loopStages[activeIndex]?.title}
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
					<img
						src="/static/ration-logo.png"
						alt=""
						width={72}
						height={72}
						className="splash-orbit-logo"
						decoding="async"
					/>
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
		const isCompact = window.matchMedia("(max-width: 900px)").matches;
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
				rootMargin: isCompact ? "-40% 0px -35% 0px" : "-30% 0px -45% 0px",
				threshold: [0.15, 0.5, 0.8],
			},
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
			<Reveal className="splash-section-heading">
				<p className="text-label text-hyper-green">How it works</p>
				<h2 id="loop-heading">
					One loop: Cargo → Galley → Manifest → Supply → Dock
				</h2>
				<p>
					Cook a meal and stock deducts. Buy groceries and Cargo updates.
					Nothing is retyped.
				</p>
			</Reveal>
			<div className="splash-story-grid">
				<div className="splash-story-sticky">
					<LoopDiagram activeIndex={activeIndex} />
				</div>
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
			</div>
		</section>
	);
}

function WhyRation() {
	return (
		<section className="splash-why" aria-label="Why use Ration">
			{whyCards.map((card, index) => (
				<Reveal as="article" key={card.title} delay={index * 70}>
					<span aria-hidden>0{index + 1}</span>
					<h2>{card.title}</h2>
					<p>{card.body}</p>
				</Reveal>
			))}
		</section>
	);
}

function Interfaces() {
	return (
		<section
			id="interfaces"
			className="splash-section scroll-mt-24"
			aria-labelledby="interfaces-heading"
		>
			<Reveal className="splash-section-heading centered">
				<p className="text-label text-hyper-green">Use Ration your way</p>
				<h2 id="interfaces-heading">One kitchen. Three interfaces.</h2>
				<p>
					Your inventory, meals, plans, and shopping list stay in sync
					everywhere.
				</p>
			</Reveal>

			<div className="splash-interfaces">
				<Reveal as="article" className="splash-interface splash-interface-ios">
					<div className="splash-interface-copy">
						<span className="splash-interface-number">
							01 · Priority access
						</span>
						<p className="text-label text-hyper-green">iOS + Copilot</p>
						<h3>The full kitchen in your pocket.</h3>
						<p>
							Ask Ration what to cook and get an answer from your actual stock.
							Scan receipts, plan meals, and shop the gaps while you move.
						</p>
						<a
							href={APP_STORE_URL}
							className="splash-app-store"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Download Ration on the App Store"
						>
							<img
								src="/static/download-on-the-app-store.svg"
								alt="Download on the App Store"
								width={140}
								height={47}
							/>
						</a>
					</div>
					<div className="splash-ios-pair">
						<img
							src="/static/landing/ios-hub.png"
							alt="Ration kitchen Hub on iPhone"
							width={331}
							height={720}
							loading="lazy"
						/>
						<img
							src="/static/landing/ios-ask.png"
							alt="Ask Ration Copilot on iPhone"
							width={331}
							height={720}
							loading="lazy"
						/>
					</div>
				</Reveal>

				<Reveal
					as="article"
					className="splash-interface splash-interface-mcp"
					delay={70}
				>
					<div className="splash-interface-copy">
						<span className="splash-interface-number">02 · Agent access</span>
						<p className="text-label text-hyper-green">MCP</p>
						<h3>Bring your own AI.</h3>
						<p>
							Paste one URL into Claude, ChatGPT, Cursor, or any compatible
							client. Your agent reads and updates the same kitchen.
						</p>
						<Link to="/connect" className="splash-inline-link">
							Connect an AI agent <ArrowRight aria-hidden size={15} />
						</Link>
					</div>
					<section
						className="splash-terminal"
						aria-label="Real MCP tool sequence"
					>
						<p>
							<span>01</span> get_expiring_items
						</p>
						<p>
							<span>02</span> match_meals
						</p>
						<p>
							<span>03</span> sync_supply_from_selected_meals
						</p>
						<strong>One live kitchen · OAuth 2.1</strong>
					</section>
				</Reveal>

				<Reveal
					as="article"
					className="splash-interface splash-interface-web"
					delay={140}
				>
					<div className="splash-interface-copy">
						<span className="splash-interface-number">03 · Browser access</span>
						<p className="text-label text-hyper-green">Web + Copilot</p>
						<h3>Your kitchen, on any screen.</h3>
						<p>
							Everything also runs at ration.mayutic.com — the same data and the
							same Ask Ration assistant, with nothing to install.
						</p>
						<a href="#signup" className="splash-inline-link">
							Start free on the web <ArrowRight aria-hidden size={15} />
						</a>
					</div>
					<div className="splash-web-shot">
						<img
							src="/static/ration-cargo-light.webp"
							alt="Ration Cargo inventory in the web app"
							width={2952}
							height={1472}
							loading="lazy"
						/>
					</div>
				</Reveal>
			</div>
		</section>
	);
}

function CapabilityProof() {
	return (
		<section className="splash-proof" aria-labelledby="proof-heading">
			<Reveal className="splash-section-heading centered">
				<p className="text-label text-hyper-green">Real kitchen work</p>
				<h2 id="proof-heading">
					See what changes when your pantry stays current.
				</h2>
			</Reveal>

			<section className="splash-capabilities" aria-label="Core capabilities">
				{capabilities.map((capability, index) => {
					const Icon = capability.icon;
					return (
						<Reveal key={capability.label} delay={index * 70}>
							<Icon aria-hidden size={20} />
							<span>
								<strong>{capability.label}</strong>
								<small>{capability.value}</small>
							</span>
						</Reveal>
					);
				})}
			</section>

			<div className="splash-shots">
				{proofShots.map((shot, index) => (
					<Reveal as="article" key={shot.src} delay={index * 70}>
						<img
							src={shot.src}
							alt={shot.alt}
							width={331}
							height={720}
							loading="lazy"
						/>
						<p>{shot.caption}</p>
					</Reveal>
				))}
			</div>

			<Reveal className="splash-resources">
				<span>Go deeper</span>
				<Link to={HELP_DOCS_URL}>
					Docs <ArrowRight aria-hidden size={14} />
				</Link>
				<a href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
					YouTube channel <ExternalLink aria-hidden size={14} />
				</a>
			</Reveal>
		</section>
	);
}

export function SplashExperience() {
	return (
		<>
			<section className="splash-hero" aria-labelledby="splash-title">
				<div className="splash-hero-copy">
					<div className="splash-brand">
						<img
							src="/static/ration-logo.png"
							alt=""
							width={80}
							height={80}
							className="splash-brand-mark"
							decoding="async"
						/>
						<div className="splash-brand-copy">
							<p className="splash-brand-name">Ration</p>
							<p className="splash-brand-tag">
								<span className="splash-status-dot" aria-hidden />
								Pantry · Meals · Shopping — one live system
							</p>
						</div>
					</div>
					<h1 id="splash-title">
						Know your kitchen. Shop only what's missing.
					</h1>
					<p>
						Ration keeps a live inventory of your food. Ask what&apos;s for
						dinner, plan the week from what you already have, and get a shopping
						list of only the gaps — on iPhone, on the web, or inside Claude and
						ChatGPT.
					</p>
					<div className="splash-hero-actions">
						<a
							href={APP_STORE_URL}
							className="splash-primary-cta"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Get Ration on the App Store"
						>
							Get the app <ArrowRight aria-hidden size={17} />
						</a>
						<a href="#signup" className="splash-secondary-link">
							or start free on the web
						</a>
					</div>
					<a href="#how-it-works" className="splash-scroll-cue">
						See how the loop works <ArrowDown aria-hidden size={15} />
					</a>
				</div>
				<ExplainerVideo />
			</section>
			<WhyRation />
			<ClosedLoopStory />
			<Interfaces />
			<CapabilityProof />
		</>
	);
}
