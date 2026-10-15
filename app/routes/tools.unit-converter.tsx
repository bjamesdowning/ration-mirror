import { Link } from "react-router";
import { JsonLd } from "~/components/seo/JsonLd";
import { PublicFooter } from "~/components/shell/PublicFooter";
import { PublicHeader } from "~/components/shell/PublicHeader";
import { MeasurementReference } from "~/components/tools/MeasurementReference";
import { UnitConverterForm } from "~/components/tools/UnitConverterForm";
import { APP_STORE_URL } from "~/lib/marketing";
import { canonicalMeta, ogMeta } from "~/lib/seo";
import { breadcrumbSchema, webAppSchema } from "~/lib/structured-data";
import type { Route } from "./+types/tools.unit-converter";

export function meta(_: Route.MetaArgs) {
	const title =
		"Cooking Unit Converter — Cups to Grams, Flour, Sugar & More | Ration";
	const description =
		"Free cooking unit converter. Turn cups into grams, tbsp into ml and oz into grams, with accurate weights for flour, sugar, butter and 80+ ingredients.";
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
			"Convert cooking measurements between volume and weight, using ingredient-specific densities for flour, sugar, butter and 80+ common ingredients.",
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
						Stop converting by hand
					</h2>
					<p className="text-muted text-sm max-w-md mx-auto mb-6 leading-relaxed">
						Ration keeps your pantry, Meals and shopping list in one place, and
						it handles cups, grams and ingredient weights for you. It's free to
						start, on the web and on iPhone.
					</p>
					<div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
						<Link
							to="/#signup"
							className="inline-block px-6 py-3 bg-hyper-green text-on-hyper-green font-bold text-sm uppercase tracking-wider rounded-lg hover:shadow-glow transition-shadow"
						>
							Get started free
						</Link>
						<a
							href={APP_STORE_URL}
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
					<p className="mt-5 text-sm">
						<Link
							to="/blog"
							className="text-muted underline underline-offset-4 hover:text-hyper-green transition-colors"
						>
							Read the blog
						</Link>
					</p>
				</div>
			</main>

			<PublicFooter />
		</div>
	);
}
