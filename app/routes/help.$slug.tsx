import { Link } from "react-router";
import { HelpMarkdown } from "~/components/help/HelpMarkdown";
import { JsonLd } from "~/components/seo/JsonLd";
import { PublicFooter } from "~/components/shell/PublicFooter";
import { PublicHeader } from "~/components/shell/PublicHeader";
import { getHelpArticle } from "~/lib/help/help.server";
import { canonicalMeta, ogMeta } from "~/lib/seo";
import { breadcrumbSchema, webPageSchema } from "~/lib/structured-data";
import type { Route } from "./+types/help.$slug";

export function loader({ params }: Route.LoaderArgs) {
	const article = getHelpArticle(params.slug);
	if (!article) throw new Response("Not Found", { status: 404 });
	return { article };
}

export function meta({ data }: Route.MetaArgs) {
	const article = data?.article;
	if (!article) return [{ title: "Not Found" }];
	const title = `${article.title} | Ration Help`;
	const description = article.summary;
	return [
		{ title },
		{ name: "description", content: description },
		canonicalMeta(`/help/${article.slug}`),
		...ogMeta({
			title,
			description,
			path: `/help/${article.slug}`,
		}),
	];
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	if (error instanceof Response && error.status === 404) {
		return (
			<div className="min-h-screen bg-ceramic text-carbon flex flex-col items-center justify-center p-6">
				<h1 className="text-display text-2xl text-carbon mb-4">
					Article not found
				</h1>
				<Link to="/help" className="text-hyper-green hover:underline">
					← Back to user guide
				</Link>
			</div>
		);
	}
	throw error;
}

export default function HelpArticlePage({ loaderData }: Route.ComponentProps) {
	const { article } = loaderData;

	const schemas = [
		breadcrumbSchema([
			{ name: "Home", path: "/" },
			{ name: "Help", path: "/help" },
			{ name: article.title, path: `/help/${article.slug}` },
		]),
		webPageSchema({
			name: article.title,
			description: article.summary,
			path: `/help/${article.slug}`,
		}),
	];

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
				<nav className="mb-6 text-sm">
					<Link
						to="/help"
						className="text-muted hover:text-hyper-green transition-colors"
					>
						← User guide
					</Link>
				</nav>
				<article className="prose-article max-w-none">
					<HelpMarkdown content={article.content} />
				</article>
			</main>
			<PublicFooter />
		</div>
	);
}
