import { Link } from "react-router";
import { HelpMarkdown } from "~/components/help/HelpMarkdown";
import { JsonLd } from "~/components/seo/JsonLd";
import { PublicFooter } from "~/components/shell/PublicFooter";
import { PublicHeader } from "~/components/shell/PublicHeader";
import {
	HELP_ARTICLES,
	HELP_SECTIONS,
	helpArticlesBySection,
} from "~/lib/help/articles";
import { getHelpDirectoryMarkdown } from "~/lib/help/help.server";
import { canonicalMeta, ogMeta } from "~/lib/seo";
import { breadcrumbSchema, webPageSchema } from "~/lib/structured-data";
import type { Route } from "./+types/help";

export function loader() {
	return { directoryMd: getHelpDirectoryMarkdown() };
}

export function meta(_: Route.MetaArgs) {
	const title = "User guide | Ration";
	const description =
		"How to use Ration: Cargo, Galley, Manifest, Supply, groups, billing, and agents. Same articles Ask Ration searches.";
	return [
		{ title },
		{ name: "description", content: description },
		canonicalMeta("/help"),
		...ogMeta({ title, description, path: "/help" }),
	];
}

const schemas = [
	webPageSchema({
		name: "Ration user guide",
		description:
			"How to use Ration. Same product documentation Ask Ration uses.",
		path: "/help",
	}),
	breadcrumbSchema([
		{ name: "Home", path: "/" },
		{ name: "Help", path: "/help" },
	]),
];

export default function HelpIndex({ loaderData }: Route.ComponentProps) {
	const { directoryMd } = loaderData;

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
			<PublicHeader />
			<main className="relative flex-1 max-w-3xl mx-auto w-full px-6 py-12">
				<p className="text-xs uppercase tracking-widest text-muted mb-3">
					User guide
				</p>
				{directoryMd ? (
					<article className="prose-article max-w-none">
						<HelpMarkdown content={directoryMd} />
					</article>
				) : (
					<>
						<h1 className="text-display text-3xl text-carbon mb-4">
							Ration user guide
						</h1>
						<p className="text-muted mb-8">
							These articles are the same product documentation Ask Ration
							searches. Browse by topic below.
						</p>
						<nav className="space-y-10" aria-label="Guide topics">
							{HELP_SECTIONS.map((section) => {
								const articles = helpArticlesBySection(section.id);
								if (articles.length === 0) return null;
								return (
									<section key={section.id}>
										<h2 className="text-display text-xl text-carbon mb-3">
											{section.title}
										</h2>
										<ul className="space-y-2">
											{articles.map((article) => (
												<li key={article.slug}>
													<Link
														to={`/help/${article.slug}`}
														className="group block rounded-lg border border-platinum/80 bg-white/50 px-4 py-3 hover:border-hyper-green/50 transition-colors dark:border-white/10 dark:bg-white/[0.03]"
													>
														<span className="font-medium text-carbon group-hover:text-hyper-green dark:text-ceramic">
															{article.title}
														</span>
														<span className="block text-sm text-muted mt-0.5">
															{article.summary}
														</span>
													</Link>
												</li>
											))}
										</ul>
									</section>
								);
							})}
						</nav>
						<p className="sr-only">{HELP_ARTICLES.length} articles</p>
					</>
				)}
			</main>
			<PublicFooter />
		</div>
	);
}
