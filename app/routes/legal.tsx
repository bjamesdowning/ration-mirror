// @ts-nocheck
import { Link, Outlet } from "react-router";

export default function LegalLayout() {
	return (
		<div className="min-h-screen bg-[#051105] text-[#39FF14] font-mono selection:bg-[#39FF14] selection:text-[#051105]">
			{/* HUD Header */}
			<header className="border-b border-[#39FF14]/30 bg-[#051105]/90 backdrop-blur sticky top-0 z-50">
				<div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
					<Link
						to="/"
						className="text-xl font-bold tracking-tighter uppercase group flex items-center gap-2"
					>
						<div className="w-3 h-3 bg-[#39FF14] group-hover:animate-pulse shadow-[0_0_10px_#39FF14]" />
						RATION <span className="text-[#39FF14]/50">/ LEGAL</span>
					</Link>
					<nav className="flex gap-6 text-sm">
						<Link
							to="/legal/terms"
							className="hover:text-[#39FF14] hover:underline underline-offset-4 decoration-[#39FF14]/50 opacity-70 hover:opacity-100 transition-all uppercase tracking-widest"
						>
							Terms
						</Link>
						<Link
							to="/legal/privacy"
							className="hover:text-[#39FF14] hover:underline underline-offset-4 decoration-[#39FF14]/50 opacity-70 hover:opacity-100 transition-all uppercase tracking-widest"
						>
							Privacy
						</Link>
					</nav>
				</div>
			</header>

			{/* Content Container */}
			<main className="max-w-4xl mx-auto px-6 py-12">
				<article
					className="prose prose-invert prose-green max-w-none 
            prose-headings:font-bold prose-headings:uppercase prose-headings:tracking-tighter prose-headings:text-[#39FF14]
            prose-h1:text-4xl prose-h1:mb-8 prose-h1:border-b prose-h1:border-[#39FF14]/30 prose-h1:pb-4
            prose-a:text-[#39FF14] prose-a:no-underline hover:prose-a:underline
            prose-strong:text-[#39FF14]
            prose-ul:list-square prose-li:marker:text-[#39FF14]
            text-[#39FF14]/90 leading-relaxed"
				>
					<Outlet />
				</article>
			</main>

			{/* Footer */}
			<footer className="border-t border-[#39FF14]/30 py-8 mt-12 bg-[#051105]">
				<div className="max-w-4xl mx-auto px-6 flex justify-between items-center text-xs uppercase tracking-widest text-[#39FF14]/50">
					<p>© {new Date().getFullYear()} Mayutic. All Systems Nominal.</p>
					<Link to="/" className="hover:text-[#39FF14]">
						Return to Base
					</Link>
				</div>
			</footer>
		</div>
	);
}
