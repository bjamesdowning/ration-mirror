import { Link, Outlet } from "react-router";

export default function LegalLayout() {
	return (
		<div className="min-h-screen bg-ceramic text-carbon">
			{/* Header */}
			<header className="border-b border-carbon/10 bg-ceramic/90 backdrop-blur sticky top-0 z-50">
				<div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
					<Link
						to="/"
						className="text-display text-xl text-carbon group flex items-center gap-2"
					>
						<div className="w-3 h-3 rounded-full bg-hyper-green group-hover:animate-pulse shadow-glow-sm" />
						Ration
						<span className="text-muted">/ Legal</span>
					</Link>
					<nav className="flex gap-6 text-sm">
						<Link
							to="/legal/terms"
							className="text-muted hover:text-hyper-green transition-colors py-2"
						>
							Terms
						</Link>
						<Link
							to="/legal/privacy"
							className="text-muted hover:text-hyper-green transition-colors py-2"
						>
							Privacy
						</Link>
					</nav>
				</div>
			</header>

			{/* Content Container */}
			<main className="max-w-4xl mx-auto px-6 py-12">
				<article className="prose-article max-w-none">
					<Outlet />
				</article>
			</main>

			{/* Footer */}
			<footer className="border-t border-carbon/10 py-8 mt-12 bg-ceramic">
				<div className="max-w-4xl mx-auto px-6 flex justify-between items-center text-xs text-muted">
					<p>© {new Date().getFullYear()} Mayutic. All rights reserved.</p>
					<Link to="/" className="hover:text-hyper-green transition-colors">
						Back to Home
					</Link>
				</div>
			</footer>
		</div>
	);
}
