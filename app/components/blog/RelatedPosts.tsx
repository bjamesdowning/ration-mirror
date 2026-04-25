import { Link } from "react-router";
import type { BlogPost } from "~/lib/blog.server";

type RelatedPostsProps = {
	posts: BlogPost[];
};

/**
 * Renders a "Continue reading" rail at the bottom of a blog post.
 * Returns null when no related posts are available so the surrounding
 * layout collapses cleanly.
 */
export function RelatedPosts({ posts }: RelatedPostsProps) {
	if (posts.length === 0) return null;

	return (
		<section
			className="mt-12 pt-8 border-t border-carbon/10"
			aria-label="Related posts"
		>
			<div className="mb-6 flex items-end justify-between">
				<div>
					<span className="text-xs font-bold uppercase tracking-wider text-hyper-green">
						Continue reading
					</span>
					<h2 className="text-display text-xl text-carbon mt-1">
						More from the crew
					</h2>
				</div>
				<Link
					to="/blog"
					className="text-xs font-bold uppercase tracking-widest text-hyper-green hover:translate-x-0.5 transition-transform"
				>
					All posts →
				</Link>
			</div>
			<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{posts.map((post) => (
					<li key={post.slug}>
						<Link
							to={`/blog/${post.slug}`}
							className="group block glass-panel rounded-xl p-5 hover:border-hyper-green/30 transition-all duration-200 h-full"
						>
							<div className="w-6 h-[2px] bg-hyper-green rounded-full mb-3 group-hover:w-10 transition-all duration-300" />
							<h3 className="text-display text-base text-carbon group-hover:text-hyper-green transition-colors leading-snug mb-2">
								{post.title}
							</h3>
							<p className="text-xs text-muted leading-relaxed line-clamp-3">
								{post.description}
							</p>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
