import {
	ArrowDown,
	ArrowRight,
	Database,
	ExternalLink,
	Flame,
	ScanLine,
	Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import {
	APP_STORE_URL,
	HELP_DOCS_URL,
	YOUTUBE_CHANNEL_URL,
} from "~/lib/marketing";
import { ExplainerTourButton, ExplainerVideoDialog } from "./ExplainerVideo";
import { Reveal } from "./Reveal";
import { SplashFuelStory } from "./SplashFuelStory";
import { SplashHeroCanvas } from "./SplashHeroCanvas";
import { SplashKitchens } from "./SplashKitchens";
import { SplashLoop } from "./SplashLoop";
import { SplashStickyCta } from "./SplashStickyCta";

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
		title: "Pantry in one app. Macros in another.",
		body: "Log the meal you cooked. Daily Fuel updates from the same plate.",
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
		label: "More than one kitchen",
		value: "Home, a sharehouse, a second place — switch when you walk in.",
		icon: Users,
	},
	{
		label: "Private Daily Fuel",
		value: "Cook for the house. Your calories and macros stay yours.",
		icon: Flame,
	},
] as const;

const proofShots = [
	{
		src: "/static/landing/import.png",
		alt: "Import a recipe from a shared video into Ration Galley",
		caption: "Save recipes from TikTok, Reels, and the web",
	},
	{
		src: "/static/landing/manifest.png",
		alt: "Ration Manifest meal planner with calorie and macro tracking on iPhone",
		caption: "Meal planner and macro tracker",
	},
	{
		src: "/static/landing/ios/ask.png",
		alt: "Ask Ration Copilot answering from live kitchen stock",
		caption: "Your kitchen copilot, on live stock",
	},
] as const;

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
				<h2 id="interfaces-heading">The full kitchen, wherever you are.</h2>
				<p>
					Your inventory, meals, plans, shopping list, and private Daily Fuel
					stay in sync on iPhone and the web. Bring your own AI when you want
					it.
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
							Scan receipts, save a recipe from social, plan the week, shop the
							gaps, and log your plate while you move.
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
					className="splash-interface splash-interface-web"
					delay={70}
				>
					<div className="splash-interface-copy">
						<span className="splash-interface-number">02 · Browser access</span>
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

				<Reveal
					as="article"
					className="splash-interface splash-interface-mcp"
					delay={140}
				>
					<div className="splash-interface-copy">
						<span className="splash-interface-number">03 · Agent access</span>
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
							<span>03</span> get_nutrition_summary
						</p>
						<strong>One live kitchen · OAuth 2.1</strong>
					</section>
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
					See what changes when your pantry and your plate stay current.
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
				{proofShots.map((shot) => (
					<article key={shot.src}>
						<figure className="splash-shots-frame">
							<img
								src={shot.src}
								alt={shot.alt}
								width={780}
								height={1688}
								decoding="async"
								draggable={false}
							/>
						</figure>
						<p>{shot.caption}</p>
					</article>
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
	const [tourOpen, setTourOpen] = useState(false);

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
								Pantry · Meals · Shopping · Macros
							</p>
						</div>
					</div>
					<h1 id="splash-title">
						Most kitchen apps do one job.
						<span>Ration runs the week.</span>
					</h1>
					<p>
						What you have, what you can cook, what to buy, and — if you want it
						— calories and macros from the meals you actually cooked. On iPhone,
						on the web, or inside Claude and ChatGPT.
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
					<ExplainerTourButton onClick={() => setTourOpen(true)} />
					<a href="#how-it-works" className="splash-scroll-cue">
						See how the loop works <ArrowDown aria-hidden size={15} />
					</a>
				</div>
				<SplashHeroCanvas />
			</section>
			<WhyRation />
			<SplashLoop />
			<SplashFuelStory />
			<SplashKitchens />
			<Interfaces />
			<CapabilityProof />
			<ExplainerVideoDialog
				open={tourOpen}
				onClose={() => setTourOpen(false)}
			/>
			<SplashStickyCta />
		</>
	);
}
