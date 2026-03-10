import { Link } from "react-router";
import { JsonLd } from "~/components/blog/JsonLd";
import { canonicalMeta, ogMeta, SITE_ORIGIN } from "~/lib/seo";
import type { Route } from "./+types/tools";

export function meta(_: Route.MetaArgs) {
	const title = "Kitchen Tools — Unit Converter & Cooking Calculators | Ration";
	const description =
		"Free cooking tools: convert cups to grams, tablespoons to milliliters, ounces to grams, and more — with ingredient-specific conversions for flour, sugar, butter, and 200+ baking ingredients.";
	return [
		{ title },
		{ name: "description", content: description },
		canonicalMeta("/tools"),
		...ogMeta({ title, description, path: "/tools" }),
	];
}

const TOOLS = [
	{
		slug: "unit-converter",
		title: "Cooking Unit Converter",
		description:
			"Convert between cups, grams, ounces, tablespoons, and more — with ingredient-specific density for flour, sugar, butter, and 200+ baking items.",
		badge: "Free",
		accent: "Volume · Weight · Density",
		href: "/tools/unit-converter",
	},
];

const breadcrumbSchema = {
	"@context": "https://schema.org",
	"@type": "BreadcrumbList",
	itemListElement: [
		{ "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
		{
			"@type": "ListItem",
			position: 2,
			name: "Tools",
			item: `${SITE_ORIGIN}/tools`,
		},
	],
};

export default function ToolsIndex() {
	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col relative">
			<JsonLd data={breadcrumbSchema} />

			{/* Ambient gradient */}
			<div
				className="absolute inset-0 pointer-events-none opacity-30"
				style={{
					background:
						"radial-gradient(ellipse at top, rgba(0,224,136,0.08) 0%, transparent 55%)",
				}}
			/>

			{/* Header */}
			<header className="relative z-50 border-b border-carbon/10 bg-ceramic/90 backdrop-blur sticky top-0">
				<div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
					<Link
						to="/"
						className="text-display text-xl text-carbon group flex items-center gap-2.5"
					>
						<div className="w-3 h-3 rounded-full bg-hyper-green group-hover:animate-pulse shadow-glow-sm" />
						Ration
						<span className="text-muted text-base"> / Tools</span>
					</Link>
					<nav className="flex items-center gap-6 text-sm">
						<Link
							to="/"
							className="text-muted hover:text-hyper-green transition-colors"
						>
							Home
						</Link>
						<Link
							to="/blog"
							className="text-muted hover:text-hyper-green transition-colors"
						>
							Blog
						</Link>
						<Link
							to="/tools"
							className="text-muted hover:text-hyper-green transition-colors"
						>
							Tools
						</Link>
						<Link
							to="/#pricing"
							className="text-muted hover:text-hyper-green transition-colors"
						>
							Pricing
						</Link>
					</nav>
				</div>
			</header>

			<main className="relative z-20 flex-1 max-w-5xl mx-auto w-full px-6 py-14">
				{/* Hero */}
				<div className="mb-14">
					<span className="text-xs font-bold uppercase tracking-wider text-hyper-green">
						Utility Bay
					</span>
					<h1 className="text-display text-3xl md:text-4xl text-carbon mt-2 mb-3">
						Kitchen Tools
					</h1>
					<p className="text-muted text-base max-w-xl leading-relaxed">
						Precision measurement tools for every kitchen. Convert units, scale
						recipes, and take the guesswork out of cooking — free, no signup
						required.
					</p>
				</div>

				{/* Tool cards */}
				<ul className="grid gap-8 sm:grid-cols-2">
					{TOOLS.map((tool) => (
						<li key={tool.slug}>
							<Link
								to={tool.href}
								className="group block glass-panel rounded-2xl p-7 hover:border-hyper-green/30 hover:shadow-glow-sm transition-all duration-200"
							>
								<div className="flex items-start justify-between mb-5">
									<div className="w-8 h-[3px] bg-hyper-green rounded-full group-hover:w-12 transition-all duration-300" />
									<span className="text-xs font-bold uppercase tracking-wider text-hyper-green/80 bg-hyper-green/10 rounded-full px-2.5 py-1">
										{tool.badge}
									</span>
								</div>

								<h2 className="text-display text-lg text-carbon group-hover:text-hyper-green transition-colors leading-snug mb-3">
									{tool.title}
								</h2>
								<p className="text-sm text-muted leading-relaxed mb-5">
									{tool.description}
								</p>

								<div className="flex items-center justify-between">
									<span className="text-xs font-mono text-carbon/40">
										{tool.accent}
									</span>
									<span className="text-hyper-green text-xs font-bold tracking-widest uppercase group-hover:translate-x-1 transition-transform">
										Open →
									</span>
								</div>
							</Link>
						</li>
					))}
				</ul>

				{/* CTA */}
				<div className="mt-16 glass-panel rounded-2xl p-8 text-center">
					<div className="w-8 h-[3px] bg-hyper-green rounded-full mx-auto mb-5" />
					<h2 className="text-display text-xl text-carbon mb-3">
						Want conversions handled automatically?
					</h2>
					<p className="text-muted text-sm max-w-md mx-auto mb-6 leading-relaxed">
						Ration tracks your Cargo, Galley recipes, and Supply lists — and
						handles unit conversions in-context when you add or cook items.
					</p>
					<Link
						to="/"
						className="inline-block px-6 py-3 bg-hyper-green text-carbon font-bold text-sm uppercase tracking-wider rounded-lg hover:shadow-glow transition-shadow"
					>
						Get started free
					</Link>
				</div>
			</main>

			<footer className="relative z-20 border-t border-carbon/10 py-8 bg-ceramic">
				<div className="max-w-5xl mx-auto px-6 flex justify-between items-center text-xs text-muted">
					<p>© {new Date().getFullYear()} Mayutic. All rights reserved.</p>
					<Link to="/" className="hover:text-hyper-green transition-colors">
						← Back to Home
					</Link>
				</div>
			</footer>
		</div>
	);
}
