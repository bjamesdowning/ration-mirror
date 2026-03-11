import { Link } from "react-router";
import { BlogCTA } from "~/components/blog/BlogCTA";
import { BlogMarkdown } from "~/components/blog/BlogMarkdown";
import { JsonLd } from "~/components/blog/JsonLd";
import { PublicHeader } from "~/components/shell/PublicHeader";
import {
	absoluteSiteUrl,
	canonicalMeta,
	OG_IMAGE,
	ogMeta,
	SITE_ORIGIN,
} from "~/lib/seo";
import type { Route } from "./+types/blog.$slug";

export async function loader({ params }: Route.LoaderArgs) {
	const { getPostBySlug } = await import("~/lib/blog.server");
	const post = getPostBySlug(params.slug);
	if (!post) throw new Response("Not Found", { status: 404 });
	return { post };
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
	const { post } = loaderData;
	const authorSchema = post.authorUrl
		? {
				"@type": "Person",
				name: post.authorName,
				url: post.authorUrl,
			}
		: {
				"@type": "Person",
				name: post.authorName,
			};

	const articleSchema = {
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		headline: post.title,
		description: post.description,
		datePublished: post.date,
		dateModified: post.dateModified,
		url: `${SITE_ORIGIN}/blog/${post.slug}`,
		mainEntityOfPage: `${SITE_ORIGIN}/blog/${post.slug}`,
		image: [absoluteSiteUrl(post.image)],
		author: authorSchema,
		publisher: {
			"@type": "Organization",
			name: "Ration",
			logo: {
				"@type": "ImageObject",
				url: OG_IMAGE,
			},
		},
		keywords: post.tags,
	};

	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col relative">
			<JsonLd data={articleSchema} />

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
							<span>By {post.authorName}</span>
						</div>
					</div>
				</div>

				{/* Article body */}
				<div className="max-w-3xl mx-auto px-6 py-12">
					<article className="prose-article max-w-none">
						<BlogMarkdown content={post.content} />
					</article>

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

			<footer className="relative z-20 border-t border-carbon/10 py-8 bg-ceramic">
				<div className="max-w-5xl mx-auto px-6 flex justify-between items-center text-xs text-muted">
					<p>© {new Date().getFullYear()} Mayutic. All rights reserved.</p>
					<Link to="/blog" className="hover:text-hyper-green transition-colors">
						← Back to Blog
					</Link>
				</div>
			</footer>
		</div>
	);
}
