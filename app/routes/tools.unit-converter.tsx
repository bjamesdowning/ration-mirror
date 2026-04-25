import { Link } from "react-router";
import { JsonLd } from "~/components/seo/JsonLd";
import { PublicFooter } from "~/components/shell/PublicFooter";
import { PublicHeader } from "~/components/shell/PublicHeader";
import { MeasurementReference } from "~/components/tools/MeasurementReference";
import { UnitConverterForm } from "~/components/tools/UnitConverterForm";
import { canonicalMeta, ogMeta } from "~/lib/seo";
import { breadcrumbSchema, webAppSchema } from "~/lib/structured-data";
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
		canonicalMeta("/tools/unit-converter"),
		...ogMeta({ title, description, path: "/tools/unit-converter" }),
	];
}

const unitConverterSchemas = [
	webAppSchema({
		name: "Ration Cooking Unit Converter",
		description:
			"Convert cooking measurements between volume and weight with ingredient-specific density for flour, sugar, butter, and 200+ baking ingredients.",
		path: "/tools/unit-converter",
	}),
	breadcrumbSchema([
		{ name: "Home", path: "/" },
		{ name: "Tools", path: "/tools" },
		{ name: "Unit Converter", path: "/tools/unit-converter" },
	]),
];

export default function UnitConverterPage() {
	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col relative">
			<JsonLd data={unitConverterSchemas} />

			{/* Ambient gradient */}
			<div
				className="absolute inset-0 pointer-events-none opacity-30"
				style={{
					background:
						"radial-gradient(ellipse at top, rgba(0,224,136,0.08) 0%, transparent 55%)",
				}}
			/>

			<PublicHeader breadcrumb="Tools" breadcrumbHref="/tools" />

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

			<PublicFooter />
		</div>
	);
}
