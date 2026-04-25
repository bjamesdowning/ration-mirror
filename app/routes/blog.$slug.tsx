import { Link } from "react-router";
import { BlogCTA } from "~/components/blog/BlogCTA";
import { BlogMarkdown } from "~/components/blog/BlogMarkdown";
import { RelatedPosts } from "~/components/blog/RelatedPosts";
import { JsonLd } from "~/components/seo/JsonLd";
import { PublicFooter } from "~/components/shell/PublicFooter";
import { PublicHeader } from "~/components/shell/PublicHeader";
import { canonicalMeta, ogMeta, SITE_ORIGIN } from "~/lib/seo";
import { articleSchema, breadcrumbSchema } from "~/lib/structured-data";
import type { Route } from "./+types/blog.$slug";

export async function loader({ params }: Route.LoaderArgs) {
	const { getPostBySlug, getRelatedPosts } = await import("~/lib/blog.server");
	const post = getPostBySlug(params.slug);
	if (!post) throw new Response("Not Found", { status: 404 });
	const related = getRelatedPosts(params.slug, 3);
	return { post, related };
}

export function meta({ data }: Route.MetaArgs) {
	const post = data?.post;
	if (!post) return [{ title: "Not Found" }];
	const title = `${post.title} | Ration Blog`;
	const description = post.description;
	return [
		{ title },
		{ name: "description", content: description },
		canonicalMeta(`/blog/${post.slug}`),
		...ogMeta({
			title,
			description,
			path: `/blog/${post.slug}`,
			image: post.image,
			type: "article",
			publishedTime: post.date,
			modifiedTime: post.dateModified,
			tags: post.tags,
		}),
	];
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	if (error instanceof Response && error.status === 404) {
		return (
			<div className="min-h-screen bg-ceramic text-carbon flex flex-col items-center justify-center p-6">
				<h1 className="text-display text-2xl text-carbon mb-4">
					Post not found
				</h1>
				<Link to="/blog" className="text-hyper-green hover:underline">
					← Back to Blog
				</Link>
			</div>
		);
	}
	throw error;
}

export default function BlogPost({ loaderData }: Route.ComponentProps) {
	const { post, related } = loaderData;

	const schemas = [
		breadcrumbSchema([
			{ name: "Home", path: "/" },
			{ name: "Blog", path: "/blog" },
			{ name: post.title, path: `/blog/${post.slug}` },
		]),
		articleSchema({
			slug: post.slug,
			title: post.title,
			description: post.description,
			datePublished: post.date,
			dateModified: post.dateModified,
			image: post.image,
			tags: post.tags,
			author: {
				name: post.authorName,
				url: post.authorUrl ?? `${SITE_ORIGIN}/about`,
			},
		}),
	];

	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col relative">
			<JsonLd data={schemas} />

			{/* Ambient gradient */}
			<div
				className="absolute inset-0 pointer-events-none opacity-25"
				style={{
					background:
						"radial-gradient(ellipse at top, rgba(0,224,136,0.08) 0%, transparent 50%)",
				}}
			/>

			<PublicHeader breadcrumb="Blog" breadcrumbHref="/blog" />

			<main className="relative z-20 flex-1 w-full">
				{/* Post hero */}
				<div className="border-b border-carbon/10 bg-carbon/[0.02]">
					<div className="max-w-3xl mx-auto px-6 py-12">
						<Link
							to="/blog"
							className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-hyper-green transition-colors mb-6 font-mono"
						>
							← All posts
						</Link>
						<div className="w-8 h-[3px] bg-hyper-green rounded-full mb-5" />
						<h1 className="text-display text-2xl md:text-3xl lg:text-4xl text-carbon leading-tight mb-4">
							{post.title}
						</h1>
						<p className="text-muted text-base leading-relaxed max-w-2xl mb-6">
							{post.description}
						</p>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono text-carbon/50">
							<time dateTime={post.date}>
								Published{" "}
								{new Date(post.date).toLocaleDateString("en-US", {
									year: "numeric",
									month: "long",
									day: "numeric",
								})}
							</time>
							<time dateTime={post.dateModified}>
								Updated{" "}
								{new Date(post.dateModified).toLocaleDateString("en-US", {
									year: "numeric",
									month: "long",
									day: "numeric",
								})}
							</time>
							<span>
								By{" "}
								<Link
									to="/about"
									className="text-carbon/70 hover:text-hyper-green transition-colors"
								>
									{post.authorName}
								</Link>
							</span>
						</div>
					</div>
				</div>

				{/* Article body */}
				<div className="max-w-3xl mx-auto px-6 py-12">
					<article className="prose-article max-w-none">
						<BlogMarkdown content={post.content} />
					</article>

					{/* Author card — E-E-A-T signal for Google + AI answer engines */}
					<aside
						className="mt-12 pt-8 border-t border-carbon/10 flex items-start gap-4"
						aria-label="About the author"
					>
						<div
							className="w-12 h-12 shrink-0 rounded-full bg-hyper-green/15 border border-hyper-green/30 flex items-center justify-center text-hyper-green font-bold text-lg"
							aria-hidden
						>
							{post.authorName.charAt(0)}
						</div>
						<div className="text-sm text-muted leading-relaxed">
							<p className="text-carbon font-bold mb-1">{post.authorName}</p>
							<p>
								Founder of Ration. Writing about AI-native kitchen software,
								MCP, and the boring infrastructure that makes meal planning
								actually work.{" "}
								<Link to="/about" className="text-hyper-green hover:underline">
									More about the team →
								</Link>
							</p>
						</div>
					</aside>

					<RelatedPosts posts={related} />

					<div className="mt-12 pt-8 border-t border-carbon/10">
						<BlogCTA
							title="Start using Ration"
							description="Track your pantry, plan meals, and reduce waste — with or without an AI assistant."
							to="/"
							label="Get started free"
						/>
					</div>
				</div>
			</main>

			<PublicFooter />
		</div>
	);
}
