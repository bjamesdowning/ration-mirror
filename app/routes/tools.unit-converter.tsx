import { Link } from "react-router";
import { JsonLd } from "~/components/blog/JsonLd";
import { MeasurementReference } from "~/components/tools/MeasurementReference";
import { UnitConverterForm } from "~/components/tools/UnitConverterForm";
import { ogMeta, SITE_ORIGIN } from "~/lib/seo";
import type { Route } from "./+types/tools.unit-converter";

export function meta(_: Route.MetaArgs) {
	const title =
		"Cooking Unit Converter — Cups to Grams, Flour, Sugar & More | Ration";
	const description =
		"Convert cups to grams, tablespoons to milliliters, ounces to grams, and more — with ingredient-specific density for flour, sugar, butter, honey, and 200+ baking ingredients. Free cooking unit converter.";
	return [
		{ title },
		{ name: "description", content: description },
		{
			name: "keywords",
			content:
				"cups to grams, cooking unit converter, flour grams per cup, tablespoons to milliliters, ounces to grams, recipe measurement converter, baking conversion",
		},
		...ogMeta({ title, description, path: "/tools/unit-converter" }),
	];
}

const toolSchema = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: "Ration Cooking Unit Converter",
	applicationCategory: "UtilitiesApplication",
	operatingSystem: "Web",
	description:
		"Convert cooking measurements between volume and weight with ingredient-specific density for flour, sugar, butter, and 200+ baking ingredients.",
	url: `${SITE_ORIGIN}/tools/unit-converter`,
	offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

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
		{
			"@type": "ListItem",
			position: 3,
			name: "Unit Converter",
			item: `${SITE_ORIGIN}/tools/unit-converter`,
		},
	],
};

export default function UnitConverterPage() {
	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col relative">
			<JsonLd data={toolSchema} />
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
					<div className="text-display text-xl text-carbon flex items-center gap-2.5">
						<Link to="/" className="group flex items-center gap-2.5">
							<div className="w-3 h-3 rounded-full bg-hyper-green group-hover:animate-pulse shadow-glow-sm" />
							Ration
						</Link>
						<span className="text-muted text-base"> / </span>
						<Link
							to="/tools"
							className="text-muted text-base hover:text-hyper-green transition-colors"
						>
							Tools
						</Link>
					</div>
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
							to="/hub/pricing"
							className="text-muted hover:text-hyper-green transition-colors"
						>
							Pricing
						</Link>
					</nav>
				</div>
			</header>

			<main className="relative z-20 flex-1 max-w-5xl mx-auto w-full px-6 py-14">
				{/* Hero */}
				<div className="mb-10">
					<nav aria-label="Breadcrumb" className="mb-5">
						<ol className="flex items-center gap-2 text-xs text-muted font-mono">
							<li>
								<Link
									to="/"
									className="hover:text-hyper-green transition-colors"
								>
									Home
								</Link>
							</li>
							<li aria-hidden>/</li>
							<li>
								<Link
									to="/tools"
									className="hover:text-hyper-green transition-colors"
								>
									Tools
								</Link>
							</li>
							<li aria-hidden>/</li>
							<li className="text-carbon">Unit Converter</li>
						</ol>
					</nav>

					<span className="text-xs font-bold uppercase tracking-wider text-hyper-green">
						Utility Bay
					</span>
					<h1 className="text-display text-3xl md:text-4xl text-carbon mt-2 mb-3">
						Cooking Unit Converter
					</h1>
					<p className="text-muted text-base max-w-2xl leading-relaxed">
						Convert between cups, grams, ounces, tablespoons, and more. Select
						an ingredient for precise weight↔volume conversions — because a cup
						of flour is not the same weight as a cup of sugar.
					</p>
				</div>

				{/* Converter */}
				<UnitConverterForm />

				{/* Measurement reference */}
				<div className="mt-16">
					<MeasurementReference />
				</div>

				{/* CTA */}
				<div className="mt-16 glass-panel rounded-2xl p-8 text-center">
					<div className="w-8 h-[3px] bg-hyper-green rounded-full mx-auto mb-5" />
					<h2 className="text-display text-xl text-carbon mb-3">
						Tired of converting manually?
					</h2>
					<p className="text-muted text-sm max-w-md mx-auto mb-6 leading-relaxed">
						Ration handles unit conversions automatically when you add
						ingredients to your Cargo or create recipes in the Galley — weight,
						volume, and ingredient density built in.
					</p>
					<div className="flex flex-col sm:flex-row gap-3 justify-center">
						<Link
							to="/"
							className="inline-block px-6 py-3 bg-hyper-green text-carbon font-bold text-sm uppercase tracking-wider rounded-lg hover:shadow-glow transition-shadow"
						>
							Get started free
						</Link>
						<Link
							to="/blog"
							className="inline-block px-6 py-3 btn-secondary font-bold text-sm uppercase tracking-wider rounded-lg border border-carbon/10"
						>
							Read the blog
						</Link>
					</div>
				</div>
			</main>

			<footer className="relative z-20 border-t border-carbon/10 py-8 bg-ceramic">
				<div className="max-w-5xl mx-auto px-6 flex justify-between items-center text-xs text-muted">
					<p>© {new Date().getFullYear()} Mayutic. All rights reserved.</p>
					<Link
						to="/tools"
						className="hover:text-hyper-green transition-colors"
					>
						← Back to Tools
					</Link>
				</div>
			</footer>
		</div>
	);
}
