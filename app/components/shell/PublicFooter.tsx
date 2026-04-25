import { Link } from "react-router";
import { APP_VERSION } from "~/lib/version";

type PublicFooterProps = {
	/** Show build version next to the copyright. Default true on home, false elsewhere. */
	showVersion?: boolean;
	/** Compact variant — single row, no link grid. For minimal pages like blog post bottoms. */
	variant?: "full" | "compact";
};

const groups: Array<{
	heading: string;
	links: Array<{ to: string; label: string }>;
}> = [
	{
		heading: "Product",
		links: [
			{ to: "/", label: "Home" },
			{ to: "/#pricing", label: "Pricing" },
			{ to: "/#signup", label: "Sign In" },
			{ to: "/docs/api", label: "API docs" },
		],
	},
	{
		heading: "Resources",
		links: [
			{ to: "/blog", label: "Blog" },
			{ to: "/tools", label: "Tools" },
			{ to: "/tools/unit-converter", label: "Unit Converter" },
		],
	},
	{
		heading: "Company",
		links: [
			{ to: "/about", label: "About" },
			{ to: "/legal/privacy", label: "Privacy" },
			{ to: "/legal/terms", label: "Terms" },
		],
	},
	{
		heading: "AI / Agents",
		links: [
			{ to: "/llms.txt", label: "llms.txt" },
			{ to: "/blog/rss.xml", label: "RSS feed" },
			{ to: "/sitemap.xml", label: "Sitemap" },
		],
	},
];

/**
 * Public sitewide footer. Renders a link grid that boosts internal-linking
 * signal across all public pages, plus the build version and copyright.
 *
 * Used by every public-facing route: home, blog, blog/$slug, tools, tools/*,
 * about, legal/*. Authenticated routes use their own hub footer.
 */
export function PublicFooter({
	showVersion = false,
	variant = "full",
}: PublicFooterProps = {}) {
	const year = new Date().getFullYear();

	if (variant === "compact") {
		return (
			<footer className="relative z-20 border-t border-carbon/10 py-8 bg-ceramic">
				<div className="max-w-5xl mx-auto px-6 flex flex-wrap justify-between items-center gap-4 text-xs text-muted">
					<p>
						© {year} Mayutic. All rights reserved.
						{showVersion ? <span className="ml-3">v{APP_VERSION}</span> : null}
					</p>
					<nav className="flex flex-wrap gap-5" aria-label="Footer">
						<Link to="/" className="hover:text-hyper-green transition-colors">
							Home
						</Link>
						<Link
							to="/blog"
							className="hover:text-hyper-green transition-colors"
						>
							Blog
						</Link>
						<Link
							to="/tools"
							className="hover:text-hyper-green transition-colors"
						>
							Tools
						</Link>
						<Link
							to="/about"
							className="hover:text-hyper-green transition-colors"
						>
							About
						</Link>
						<Link
							to="/legal/privacy"
							className="hover:text-hyper-green transition-colors"
						>
							Privacy
						</Link>
						<Link
							to="/legal/terms"
							className="hover:text-hyper-green transition-colors"
						>
							Terms
						</Link>
					</nav>
				</div>
			</footer>
		);
	}

	return (
		<footer className="relative z-20 border-t border-carbon/10 bg-ceramic/90 backdrop-blur mt-12">
			<div className="max-w-7xl mx-auto px-6 py-12">
				<div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
					{groups.map((group) => (
						<div key={group.heading}>
							<h3 className="text-xs font-bold uppercase tracking-wider text-carbon mb-3">
								{group.heading}
							</h3>
							<ul className="space-y-2">
								{group.links.map((link) => (
									<li key={link.to}>
										<Link
											to={link.to}
											className="text-sm text-muted hover:text-hyper-green transition-colors"
										>
											{link.label}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
				<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pt-6 border-t border-carbon/10 text-xs text-muted">
					<div className="flex items-center gap-3">
						<div className="w-2 h-2 rounded-full bg-hyper-green shadow-glow-sm" />
						<span className="font-bold text-carbon">Ration</span>
						<span>by Mayutic</span>
						{showVersion ? (
							<span className="ml-1 font-mono">v{APP_VERSION}</span>
						) : null}
					</div>
					<p>© {year} Mayutic. All rights reserved.</p>
				</div>
			</div>
		</footer>
	);
}
