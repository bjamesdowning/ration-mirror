import { Link } from "react-router";
import { BlogCTA } from "~/components/blog/BlogCTA";
import { BlogMarkdown } from "~/components/blog/BlogMarkdown";
import { JsonLd } from "~/components/blog/JsonLd";
import { canonicalMeta, ogMeta, SITE_ORIGIN } from "~/lib/seo";
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
		...ogMeta({ title, description, path: `/blog/${post.slug}` }),
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

	const articleSchema = {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: post.title,
		description: post.description,
		datePublished: post.date,
		url: `${SITE_ORIGIN}/blog/${post.slug}`,
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

			{/* Header */}
			<header className="relative z-50 border-b border-carbon/10 bg-ceramic/90 backdrop-blur sticky top-0">
				<div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
					<Link
						to="/"
						className="text-display text-xl text-carbon group flex items-center gap-2.5"
					>
						<div className="w-3 h-3 rounded-full bg-hyper-green group-hover:animate-pulse shadow-glow-sm" />
						Ration
						<span className="text-muted text-base"> / Blog</span>
					</Link>
					<nav className="flex items-center gap-6 text-sm">
						<Link
							to="/blog"
							className="text-muted hover:text-hyper-green transition-colors"
						>
							All posts
						</Link>
						<Link
							to="/"
							className="text-muted hover:text-hyper-green transition-colors"
						>
							Home
						</Link>
					</nav>
				</div>
			</header>

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
						<time
							dateTime={post.date}
							className="text-xs font-mono text-carbon/50"
						>
							{new Date(post.date).toLocaleDateString("en-US", {
								year: "numeric",
								month: "long",
								day: "numeric",
							})}
						</time>
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
