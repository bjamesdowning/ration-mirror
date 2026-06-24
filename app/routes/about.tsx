import { Link } from "react-router";
import { JsonLd } from "~/components/seo/JsonLd";
import { PublicFooter } from "~/components/shell/PublicFooter";
import { PublicHeader } from "~/components/shell/PublicHeader";
import { canonicalMeta, ogMeta } from "~/lib/seo";
import {
	breadcrumbSchema,
	organizationSchema,
	webPageSchema,
} from "~/lib/structured-data";
import type { Route } from "./+types/about";

export function meta(_: Route.MetaArgs) {
	const title = "About Ration | The team building AI-native kitchen software";
	const description =
		"Ration is built by Mayutic — an independent product studio focused on AI-native consumer software. Learn about the mission, the team, and the product roadmap.";
	return [
		{ title },
		{ name: "description", content: description },
		canonicalMeta("/about"),
		...ogMeta({ title, description, path: "/about" }),
	];
}

const schemas = [
	webPageSchema({
		name: "About Ration",
		description:
			"About the team and mission behind Ration — AI-native kitchen management built by Mayutic.",
		path: "/about",
	}),
	breadcrumbSchema([
		{ name: "Home", path: "/" },
		{ name: "About", path: "/about" },
	]),
	organizationSchema({
		sameAs: ["https://www.mayutic.com"],
	}),
];

export default function AboutPage() {
	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col relative">
			<JsonLd data={schemas} />

			<div
				className="absolute inset-0 pointer-events-none opacity-30"
				style={{
					background:
						"radial-gradient(ellipse at top, rgba(0,224,136,0.08) 0%, transparent 55%)",
				}}
			/>

			<PublicHeader breadcrumb="About" breadcrumbHref="/about" />

			<main className="relative z-20 flex-1 max-w-4xl mx-auto w-full px-6 py-14">
				{/* Hero */}
				<header className="mb-14">
					<span className="text-xs font-bold uppercase tracking-wider text-hyper-green">
						Mission Brief
					</span>
					<h1 className="text-display text-3xl md:text-5xl text-carbon mt-2 mb-4 leading-tight">
						Kitchen software, rebuilt around the AI agent.
					</h1>
					<p className="text-muted text-lg max-w-2xl leading-relaxed">
						Ration is an AI-native pantry, recipe, and meal-planning system
						designed for a world where your assistant — Claude, ChatGPT, Cursor
						— operates your kitchen alongside you. We treat the AI agent as a
						first-class user, not a chat bolted on top.
					</p>
				</header>

				{/* Company / mission */}
				<section className="space-y-10 mb-12">
					<div>
						<h2 className="text-display text-2xl text-carbon mb-4">Mayutic</h2>
						<p className="text-muted leading-relaxed">
							Ration is built by Mayutic, an independent product studio focused
							on AI-native consumer software. Mayutic ships products at the edge
							— Cloudflare Workers, D1, R2, Vectorize, Workers AI — because we
							think low-latency, globally-distributed infrastructure is the
							right substrate for software that an AI agent operates on your
							behalf.
						</p>
					</div>

					<div>
						<h2 className="text-display text-2xl text-carbon mb-4">Mission</h2>
						<p className="text-muted leading-relaxed mb-3">
							Eliminate the everyday cognitive overhead of running a kitchen —
							what is in stock, what to cook, what to buy — by making the entire
							workflow operable by an AI agent that has real, current context
							about your pantry.
						</p>
						<p className="text-muted leading-relaxed">
							We believe the next generation of consumer software will be
							designed agent-first: structured data, durable APIs, and MCP
							servers that any AI client can drive with natural language. Ration
							is one bet against that future.
						</p>
					</div>

					<div>
						<h2 className="text-display text-2xl text-carbon mb-4">
							Principles
						</h2>
						<ul className="space-y-3 text-muted leading-relaxed">
							<li className="flex gap-3">
								<span className="text-hyper-green font-bold shrink-0">→</span>
								<span>
									<strong className="text-carbon">Agent-first.</strong> Every
									feature ships with an MCP equivalent and an API endpoint.
								</span>
							</li>
							<li className="flex gap-3">
								<span className="text-hyper-green font-bold shrink-0">→</span>
								<span>
									<strong className="text-carbon">Edge-native.</strong>{" "}
									Inventory and meal data sit at the edge so AI grounding
									requests are fast.
								</span>
							</li>
							<li className="flex gap-3">
								<span className="text-hyper-green font-bold shrink-0">→</span>
								<span>
									<strong className="text-carbon">Browser-native.</strong> Use
									Ration on desktop or mobile from any modern browser — no app
									store install required.
								</span>
							</li>
							<li className="flex gap-3">
								<span className="text-hyper-green font-bold shrink-0">→</span>
								<span>
									<strong className="text-carbon">Privacy by default.</strong>{" "}
									Your kitchen data is yours. No selling, no cross-user leaks,
									and exportable any time.
								</span>
							</li>
						</ul>
					</div>
				</section>

				{/* CTA */}
				<section className="glass-panel rounded-2xl p-8 text-center">
					<div className="w-8 h-[3px] bg-hyper-green rounded-full mx-auto mb-5" />
					<h2 className="text-display text-xl text-carbon mb-3">
						Try Ration with your AI assistant
					</h2>
					<p className="text-muted text-sm max-w-md mx-auto mb-6 leading-relaxed">
						Free to start. Paste the MCP URL into Claude, ChatGPT, or Cursor —
						authorize once in your browser and let your agent operate your
						kitchen.
					</p>
					<Link
						to="/"
						className="inline-block px-6 py-3 bg-hyper-green text-carbon font-bold text-sm uppercase tracking-wider rounded-lg hover:shadow-glow transition-shadow"
					>
						Get started free
					</Link>
				</section>
			</main>

			<PublicFooter />
		</div>
	);
}
