// @ts-nocheck
import type { Route } from "./+types/home";
import "../../load-context"; // Ensure augmentation is loaded
import { Link } from "react-router";

export function meta(_: Route.MetaArgs) {
	return [
		{ title: "Ration - Smart Pantry Management" },
		{
			name: "description",
			content: "AI-Powered Pantry & Meal Planning System",
		},
	];
}

export default function Home() {
	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col relative">
			{/* Subtle gradient background */}
			<div
				className="absolute inset-0 pointer-events-none opacity-30"
				style={{
					background:
						"radial-gradient(ellipse at top, rgba(0,224,136,0.1) 0%, transparent 50%)",
				}}
			/>

			{/* Under Construction Banner */}
			<div className="relative z-50 bg-hyper-green/10 border-b border-hyper-green/20 p-2 text-center">
				<p className="text-xs uppercase tracking-wider font-bold text-carbon">
					<span className="text-hyper-green">⚡</span> Early Access {" // "}
					v0.9.4-ALPHA {" // "} Some features in development
				</p>
			</div>

			{/* Main Content */}
			<main className="flex-1 w-full relative z-20">
				<div className="max-w-7xl mx-auto px-6 py-12 md:py-24 flex flex-col items-center gap-24 md:gap-32">
					{/* Hero Section */}
					<div className="max-w-4xl w-full flex flex-col items-center gap-12 text-center">
						{/* Logo Container */}
						<div className="relative group">
							<div className="absolute -inset-4 bg-hyper-green/5 rounded-full blur-xl group-hover:bg-hyper-green/10 transition-all duration-500" />
							<img
								src="/static/ration-logo-final-no-background.png"
								alt="Ration"
								className="w-64 md:w-96 relative z-10 drop-shadow-lg"
							/>
						</div>

						{/* Title & Tagline */}
						<div className="space-y-4">
							<h1 className="text-display text-4xl md:text-6xl tracking-tight text-carbon">
								Ration<span className="text-hyper-green">.app</span>
							</h1>
							<p className="text-muted text-lg md:text-xl max-w-2xl mx-auto">
								Smart pantry management and meal planning for modern kitchens
							</p>
						</div>

						{/* decorative status lines */}
						<div className="flex flex-wrap justify-center gap-8 text-xs uppercase tracking-wider text-muted">
							<span className="flex items-center gap-2">
								<span className="w-2 h-2 rounded-full bg-success animate-pulse" />
								System Online
							</span>
							<span>Low Latency</span>
							<span>Secure</span>
						</div>

						{/* CTA Buttons */}
						<div className="flex flex-col md:flex-row gap-4 w-full max-w-md mt-8">
							<Link
								to="/sign-in"
								className="flex-1 bg-hyper-green text-carbon font-bold text-center py-4 px-8 rounded-xl shadow-glow hover:shadow-glow-sm transition-all hover:scale-105"
							>
								Sign In
							</Link>
							<Link
								to="/sign-up"
								className="flex-1 glass-panel text-carbon font-bold text-center py-4 px-8 rounded-xl hover:bg-platinum transition-all"
							>
								Get Started
							</Link>
						</div>
					</div>

					{/* Mission Protocol Section */}
					<section className="w-full max-w-4xl grid md:grid-cols-[1fr_2fr] gap-8 md:gap-16 items-start border-t border-carbon/10 pt-16 md:pt-24">
						<div className="space-y-4">
							<h2 className="text-display text-2xl text-carbon flex items-center gap-4">
								<span className="w-8 h-[3px] bg-hyper-green rounded-full" />
								Our Mission
							</h2>
							<div className="text-label text-muted">What We Do</div>
						</div>
						<div className="space-y-6 text-carbon/80">
							<p className="text-lg leading-relaxed">
								<strong className="text-carbon">Ration</strong> is a zero-waste
								pantry management and meal planning platform designed to
								optimize your kitchen's efficiency.
							</p>
							<p className="leading-relaxed text-muted">
								The objective is simple: eliminate food waste and streamline
								your meal planning. By tracking your pantry like a smart
								inventory system, Ration helps you manage ingredients, plan
								meals effectively, and never waste food again.
							</p>
							<ul className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-sm">
								<li className="flex items-center gap-3">
									<span className="w-2 h-2 rounded-full bg-hyper-green" />
									Pantry Inventory
								</li>
								<li className="flex items-center gap-3">
									<span className="w-2 h-2 rounded-full bg-hyper-green" />
									Meal Planning
								</li>
								<li className="flex items-center gap-3">
									<span className="w-2 h-2 rounded-full bg-hyper-green" />
									AI Receipt Scanning
								</li>
								<li className="flex items-center gap-3">
									<span className="w-2 h-2 rounded-full bg-hyper-green" />
									Waste Reduction
								</li>
							</ul>
						</div>
					</section>

					{/* Features Section */}
					<section className="w-full max-w-5xl space-y-12 border-t border-carbon/10 pt-16 md:pt-24">
						<div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
							<div className="space-y-4">
								<h2 className="text-display text-2xl text-carbon flex items-center gap-4">
									<span className="w-8 h-[3px] bg-hyper-green rounded-full" />
									Key Features
								</h2>
								<div className="text-label text-muted">How It Works</div>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
							{/* Feature Card 01 */}
							<div className="group glass-panel rounded-2xl p-6 hover:shadow-lg transition-all">
								<div className="text-label text-muted mb-4">01</div>
								<h3 className="text-display text-xl text-carbon mb-2 group-hover:text-hyper-green transition-colors">
									Profile
								</h3>
								<div className="h-[2px] w-8 bg-hyper-green mb-4 group-hover:w-full transition-all duration-500 rounded-full" />
								<p className="text-sm text-muted leading-relaxed">
									Set up your dietary preferences, allergens, and caloric goals
									for personalized recommendations.
								</p>
							</div>

							{/* Feature Card 02 */}
							<div className="group glass-panel rounded-2xl p-6 hover:shadow-lg transition-all">
								<div className="text-label text-muted mb-4">02</div>
								<h3 className="text-display text-xl text-carbon mb-2 group-hover:text-hyper-green transition-colors">
									Pantry
								</h3>
								<div className="h-[2px] w-8 bg-hyper-green mb-4 group-hover:w-full transition-all duration-500 rounded-full" />
								<p className="text-sm text-muted leading-relaxed">
									Track your food inventory by category: dry goods, frozen,
									fresh produce, and more.
								</p>
							</div>

							{/* Feature Card 03 */}
							<div className="group glass-panel rounded-2xl p-6 hover:shadow-lg transition-all">
								<div className="text-label text-muted mb-4">03</div>
								<h3 className="text-display text-xl text-carbon mb-2 group-hover:text-hyper-green transition-colors">
									Dashboard
								</h3>
								<div className="h-[2px] w-8 bg-hyper-green mb-4 group-hover:w-full transition-all duration-500 rounded-full" />
								<p className="text-sm text-muted leading-relaxed">
									Your central hub for tracking stock levels, meal schedules,
									and expiry alerts.
								</p>
							</div>

							{/* Feature Card 04 */}
							<div className="group glass-panel rounded-2xl p-6 hover:shadow-lg transition-all">
								<div className="text-label text-muted mb-4">04</div>
								<h3 className="text-display text-xl text-carbon mb-2 group-hover:text-hyper-green transition-colors">
									Scanner
								</h3>
								<div className="h-[2px] w-8 bg-hyper-green mb-4 group-hover:w-full transition-all duration-500 rounded-full" />
								<p className="text-sm text-muted leading-relaxed">
									Use AI-powered vision to scan receipts or manually add items
									to your inventory.
								</p>
							</div>
						</div>
					</section>
				</div>

				{/* Data Protocol Section (Transparency) */}
				<section className="w-full max-w-2xl mx-auto glass-panel rounded-2xl p-8 mt-24 text-center">
					<h2 className="text-display text-xl text-carbon mb-4">
						Data & Privacy
					</h2>
					<div className="text-label text-muted mb-6">Transparency First</div>
					<p className="text-sm text-muted leading-relaxed max-w-lg mx-auto">
						Ration uses Google OAuth for secure authentication. We only access
						your basic profile (ID, email, name) to secure your account. Your
						inventory data is stored for your benefit. We{" "}
						<span className="text-carbon font-bold">never sell</span> or share
						your personal information with third parties.
					</p>
				</section>
			</main>

			{/* Footer Status Bar */}
			<footer className="relative z-20 border-t border-carbon/10 bg-ceramic/90 backdrop-blur p-4 mt-12">
				<div className="flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto text-xs text-muted gap-4">
					<div className="flex gap-6">
						<span>Build v0.9.4-ALPHA</span>
						<Link
							to="/legal/privacy"
							className="hover:text-hyper-green transition-colors"
						>
							Privacy Policy
						</Link>
						<Link
							to="/legal/terms"
							className="hover:text-hyper-green transition-colors"
						>
							Terms of Service
						</Link>
					</div>
					<div className="hidden md:block">
						By{" "}
						<a
							href="https://www.mayutic.com"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-hyper-green transition-colors"
						>
							Mayutic
						</a>{" "}
						— Est 2025
					</div>
				</div>
			</footer>
		</div>
	);
}
