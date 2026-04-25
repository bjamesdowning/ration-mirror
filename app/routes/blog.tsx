import { Link } from "react-router";
import { JsonLd } from "~/components/seo/JsonLd";
import { PublicFooter } from "~/components/shell/PublicFooter";
import { PublicHeader } from "~/components/shell/PublicHeader";
import { canonicalMeta, ogMeta } from "~/lib/seo";
import { blogCollectionSchema, breadcrumbSchema } from "~/lib/structured-data";
import type { Route } from "./+types/blog";

export async function loader() {
	const { getAllPosts } = await import("~/lib/blog.server");
	const posts = getAllPosts();
	return { posts };
}

export function meta(_: Route.MetaArgs) {
	const title = "Blog | Ration";
	const description =
		"Tips for pantry organization, meal planning, reducing food waste, and using Ration with AI assistants.";
	return [
		{ title },
		{ name: "description", content: description },
		canonicalMeta("/blog"),
		{
			tagName: "link" as const,
			rel: "alternate",
			type: "application/rss+xml",
			title: "Ration Blog RSS",
			href: "https://ration.mayutic.com/blog/rss.xml",
		},
		...ogMeta({ title, description, path: "/blog" }),
	];
}

export default function BlogIndex({ loaderData }: Route.ComponentProps) {
	const { posts } = loaderData;

	const schemas = [
		breadcrumbSchema([
			{ name: "Home", path: "/" },
			{ name: "Blog", path: "/blog" },
		]),
		blogCollectionSchema({ posts }),
	];

	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col relative">
			<JsonLd data={schemas} />

			{/* Ambient gradient */}
			<div
				className="absolute inset-0 pointer-events-none opacity-30"
				style={{
					background:
						"radial-gradient(ellipse at top, rgba(0,224,136,0.08) 0%, transparent 55%)",
				}}
			/>

			<PublicHeader breadcrumb="Blog" breadcrumbHref="/blog" />

			<main className="relative z-20 flex-1 max-w-5xl mx-auto w-full px-6 py-14">
				{/* Hero */}
				<div className="mb-14">
					<span className="text-xs font-bold uppercase tracking-wider text-hyper-green">
						Mission Log
					</span>
					<h1 className="text-display text-3xl md:text-4xl text-carbon mt-2 mb-3">
						From the crew
					</h1>
					<p className="text-muted text-base max-w-xl leading-relaxed">
						Guides, workflows, and ideas for running a smarter kitchen — plus
						dispatches on AI-native tools and MCP integrations.
					</p>
				</div>

				{/* Post grid */}
				{posts.length === 0 ? (
					<p className="text-muted">No posts yet — check back soon.</p>
				) : (
					<ul className="grid gap-8 sm:grid-cols-2">
						{posts.map((post) => (
							<li key={post.slug}>
								<Link
									to={`/blog/${post.slug}`}
									className="group block glass-panel rounded-2xl p-7 hover:border-hyper-green/30 hover:shadow-glow-sm transition-all duration-200"
								>
									{/* Top accent */}
									<div className="w-8 h-[3px] bg-hyper-green rounded-full mb-5 group-hover:w-12 transition-all duration-300" />

									<h2 className="text-display text-lg text-carbon group-hover:text-hyper-green transition-colors leading-snug mb-3">
										{post.title}
									</h2>
									<p className="text-sm text-muted leading-relaxed mb-5">
										{post.description}
									</p>

									<div className="flex items-center justify-between">
										<time
											dateTime={post.date}
											className="text-xs text-carbon/50 font-mono"
										>
											{new Date(post.date).toLocaleDateString("en-US", {
												year: "numeric",
												month: "long",
												day: "numeric",
											})}
										</time>
										<span className="text-hyper-green text-xs font-bold tracking-widest uppercase group-hover:translate-x-1 transition-transform">
											Read →
										</span>
									</div>
								</Link>
							</li>
						))}
					</ul>
				)}
			</main>

			<PublicFooter />
		</div>
	);
}
