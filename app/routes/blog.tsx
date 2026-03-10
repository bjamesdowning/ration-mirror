import { Link } from "react-router";
import { ogMeta } from "~/lib/seo";
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
		...ogMeta({ title, description, path: "/blog" }),
	];
}

export default function BlogIndex({ loaderData }: Route.ComponentProps) {
	const { posts } = loaderData;

	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col relative">
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
						<span className="text-muted text-base"> / Blog</span>
					</Link>
					<nav className="flex items-center gap-6 text-sm">
						<Link
							to="/"
							className="text-muted hover:text-hyper-green transition-colors"
						>
							Home
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
