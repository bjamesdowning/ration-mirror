// @ts-nocheck
import type { Route } from "./+types/home";
import "../../load-context"; // Ensure augmentation is loaded

export function meta(_: Route.MetaArgs) {
	return [
		{ title: "RATION PROTOCOL /// INITIALIZE" },
		{
			name: "description",
			content: "AI-Powered Pantry & Meal Planning System",
		},
	];
}

export default function Home() {
	return (
		<div className="min-h-screen bg-[#051105] text-[#39FF14] font-mono selection:bg-[#39FF14] selection:text-[#051105] flex flex-col relative">
			{/* Grid Background Effect */}
			<div
				className="absolute inset-0 pointer-events-none opacity-20 fixed"
				style={{
					backgroundImage: `linear-gradient(#39FF14 1px, transparent 1px), linear-gradient(90deg, #39FF14 1px, transparent 1px)`,
					backgroundSize: "40px 40px",
					maskImage: "linear-gradient(to bottom, black 40%, transparent 90%)",
				}}
			/>

			{/* Scanline Effect (CSS only) */}
			<div
				className="absolute inset-0 pointer-events-none opacity-10 mix-blend-overlay z-10 fixed"
				style={{
					background:
						"linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2))",
					backgroundSize: "100% 4px",
				}}
			/>

			{/* Under Construction Banner */}
			<div className="relative z-50 bg-[#39FF14]/10 border-b border-[#39FF14] p-2 text-center">
				<p className="text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold animate-pulse">
					<span className="text-white">⚠ SYSTEM ALERT:</span> Construction in
					Progress {"//"} v0.9.4-ALPHA {"//"} DATA VOLATILITY: PERSISTENCE NOT
					GUARANTEED
				</p>
			</div>

			{/* Main Content */}
			<main className="flex-1 w-full relative z-20">
				<div className="max-w-7xl mx-auto px-6 py-12 md:py-24 flex flex-col items-center gap-24 md:gap-32">
					{/* Hero Section */}
					<div className="max-w-4xl w-full flex flex-col items-center gap-12 text-center">
						{/* Logo Container */}
						<div className="relative group">
							<div className="absolute -inset-4 bg-[#39FF14]/5 rounded-full blur-xl group-hover:bg-[#39FF14]/10 transition-all duration-500" />
							<img
								src="/static/ration-logo-final-no-background.png"
								alt="RATION PROTOCOL"
								className="w-64 md:w-96 relative z-10 drop-shadow-[0_0_15px_rgba(57,255,20,0.3)]"
							/>
						</div>

						{/* Title & Tagline */}
						<div className="space-y-4">
							<h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase glitch-text">
								Ration<span className="text-white">.Protocol</span>
							</h1>
							<p className="text-[#39FF14]/80 text-lg md:text-xl tracking-widest uppercase max-w-2xl mx-auto border-l-2 border-[#39FF14] pl-4 text-left md:text-center md:border-l-0 md:border-t-0">
								Orbital Pantry & Meal Planning Protocol
							</p>
						</div>

						{/* decorative status lines */}
						<div className="flex flex-wrap justify-center gap-8 text-[10px] uppercase tracking-[0.2em] opacity-60">
							<span>
								Sys.Status: <span className="text-white">ONLINE</span>
							</span>
							<span>
								Net.Latency: <span className="text-white">12ms</span>
							</span>
							<span>
								Sec.Level: <span className="text-white">MAX</span>
							</span>
						</div>

						{/* CTA Buttons */}
						<div className="flex flex-col md:flex-row gap-6 w-full max-w-md mt-8">
							<a
								href="/sign-in"
								className="flex-1 bg-[#39FF14] text-[#051105] font-bold text-center py-4 px-8 uppercase tracking-widest hover:bg-white hover:text-black transition-all border border-[#39FF14] relative overflow-hidden group btn-clip"
							>
								<span className="relative z-10">Access Terminal</span>
								<div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
							</a>
							<a
								href="/sign-up"
								className="flex-1 bg-transparent text-[#39FF14] font-bold text-center py-4 px-8 uppercase tracking-widest hover:bg-[#39FF14]/10 transition-all border border-[#39FF14] relative overflow-hidden group btn-clip"
							>
								<span className="relative z-10">Initialize Unit</span>
							</a>
						</div>
					</div>

					{/* Mission Protocol Section */}
					<section className="w-full max-w-4xl grid md:grid-cols-[1fr_2fr] gap-8 md:gap-16 items-start border-t border-[#39FF14]/20 pt-16 md:pt-24">
						<div className="space-y-4">
							<h2 className="text-2xl font-black uppercase tracking-wider flex items-center gap-4 text-white">
								<span className="w-8 h-[2px] bg-[#39FF14]" />
								Mission Protocol
							</h2>
							<div className="text-[10px] uppercase tracking-widest opacity-60">
								Directive 01
							</div>
						</div>
						<div className="space-y-6 text-[#39FF14]/90">
							<p className="text-lg leading-relaxed">
								<strong className="text-white">Ration</strong> is a zero-latency
								pantry management and meal planning engine designed to optimize
								your kitchen's logistics.
							</p>
							<p className="leading-relaxed opacity-80">
								The objective is simple: eliminate domestic waste and streamline
								your consumption cycle. By treating your pantry like a
								high-stakes supply chain, Ration helps you manage inventory,
								plan meals effectively, and ensure you never run out of critical
								assets.
							</p>
							<ul className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-sm uppercase tracking-wider">
								<li className="flex items-center gap-3">
									<span className="w-1.5 h-1.5 bg-[#39FF14]" />
									Pantry Inventory
								</li>
								<li className="flex items-center gap-3">
									<span className="w-1.5 h-1.5 bg-[#39FF14]" />
									Meal Planning
								</li>
								<li className="flex items-center gap-3">
									<span className="w-1.5 h-1.5 bg-[#39FF14]" />
									AI Scaling (OCR)
								</li>
								<li className="flex items-center gap-3">
									<span className="w-1.5 h-1.5 bg-[#39FF14]" />
									Waste Metrics
								</li>
							</ul>
						</div>
					</section>

					{/* System Vernacular Section */}
					<section className="w-full max-w-5xl space-y-12 border-t border-[#39FF14]/20 pt-16 md:pt-24">
						<div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
							<div className="space-y-4">
								<h2 className="text-2xl font-black uppercase tracking-wider flex items-center gap-4 text-white">
									<span className="w-8 h-[2px] bg-[#39FF14]" />
									System Vernacular
								</h2>
								<div className="text-[10px] uppercase tracking-widest opacity-60">
									Directive 02 {"//"} Terminology
								</div>
							</div>
							<div className="text-xs uppercase tracking-widest border border-[#39FF14]/30 px-3 py-1 text-[#39FF14]/60">
								Read Only Memory
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
							{/* Term Card 01 */}
							<div className="group border border-[#39FF14]/30 bg-[#39FF14]/5 p-6 hover:bg-[#39FF14]/10 transition-colors relative overflow-hidden">
								<div className="absolute top-0 right-0 p-2 text-[10px] opacity-40">
									01
								</div>
								<h3 className="text-xl font-bold text-white mb-0 group-hover:translate-x-1 transition-transform">
									HULL
								</h3>
								<div className="text-[10px] text-[#39FF14]/60 mb-2 uppercase tracking-tighter">
									[ User Profile ]
								</div>
								<div className="h-[1px] w-8 bg-[#39FF14] mb-4 group-hover:w-full transition-all duration-500" />
								<p className="text-sm opacity-80 leading-relaxed">
									The biological entity. Your profile captures allergens,
									dietary preferences, and caloric constraints here.
								</p>
							</div>

							{/* Term Card 02 */}
							<div className="group border border-[#39FF14]/30 bg-[#39FF14]/5 p-6 hover:bg-[#39FF14]/10 transition-colors relative overflow-hidden">
								<div className="absolute top-0 right-0 p-2 text-[10px] opacity-40">
									02
								</div>
								<h3 className="text-xl font-bold text-white mb-0 group-hover:translate-x-1 transition-transform">
									CARGO
								</h3>
								<div className="text-[10px] text-[#39FF14]/60 mb-2 uppercase tracking-tighter">
									[ Food & Pantry ]
								</div>
								<div className="h-[1px] w-8 bg-[#39FF14] mb-4 group-hover:w-full transition-all duration-500" />
								<p className="text-sm opacity-80 leading-relaxed">
									Nutritional assets. Your inventory items classified by type
									(Dry / Frozen / Fresh). This is your digital pantry.
								</p>
							</div>

							{/* Term Card 03 */}
							<div className="group border border-[#39FF14]/30 bg-[#39FF14]/5 p-6 hover:bg-[#39FF14]/10 transition-colors relative overflow-hidden">
								<div className="absolute top-0 right-0 p-2 text-[10px] opacity-40">
									03
								</div>
								<h3 className="text-xl font-bold text-white mb-0 group-hover:translate-x-1 transition-transform">
									HUD
								</h3>
								<div className="text-[10px] text-[#39FF14]/60 mb-2 uppercase tracking-tighter">
									[ Live Dashboard ]
								</div>
								<div className="h-[1px] w-8 bg-[#39FF14] mb-4 group-hover:w-full transition-all duration-500" />
								<p className="text-sm opacity-80 leading-relaxed">
									Heads-Up Display. The primary interface for tracking stock
									levels, meal schedules, and expiry alerts.
								</p>
							</div>

							{/* Term Card 04 */}
							<div className="group border border-[#39FF14]/30 bg-[#39FF14]/5 p-6 hover:bg-[#39FF14]/10 transition-colors relative overflow-hidden">
								<div className="absolute top-0 right-0 p-2 text-[10px] opacity-40">
									04
								</div>
								<h3 className="text-xl font-bold text-white mb-0 group-hover:translate-x-1 transition-transform">
									SCANNER
								</h3>
								<div className="text-[10px] text-[#39FF14]/60 mb-2 uppercase tracking-tighter">
									[ Smart Ingest ]
								</div>
								<div className="h-[1px] w-8 bg-[#39FF14] mb-4 group-hover:w-full transition-all duration-500" />
								<p className="text-sm opacity-80 leading-relaxed">
									The processing unit. Use AI vision to scan receipts or manual
									input to log new groceries into your manifest.
								</p>
							</div>
						</div>
					</section>
				</div>
			</main>

			{/* Footer Status Bar */}
			<footer className="relative z-20 border-t border-[#39FF14]/30 bg-[#051105]/90 backdrop-blur-sm p-4 mt-12">
				<div className="flex justify-between items-center max-w-7xl mx-auto text-[10px] uppercase tracking-widest text-[#39FF14]/60">
					<div>{"Build: v0.9.4-ALPHA // EDGE_NET"}</div>
					<div className="hidden md:block">
						By{" "}
						<a
							href="https://www.mayutic.com"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-white transition-colors"
						>
							Mayutic
						</a>{" "}
						{"/// Est 2025"}
					</div>
					<div className="animate-pulse">AWAITING INPUT...</div>
				</div>
			</footer>

			<style>{`
				.btn-clip {
					clip-path: polygon(
						10px 0, 100% 0, 
						100% calc(100% - 10px), calc(100% - 10px) 100%, 
						0 100%, 0 10px
					);
				}
				.glitch-text {
					text-shadow: 2px 0 #39FF14, -2px 0 #ff00ea;
					animation: glitch 2s infinite linear alternate-reverse;
				}
				@keyframes glitch {
					0% { text-shadow: 2px 0 #39FF14, -2px 0 #ff00ea; }
					25% { text-shadow: -2px 0 #39FF14, 2px 0 #ff00ea; }
					50% { text-shadow: 2px 0 #ff00ea, -2px 0 #39FF14; }
					75% { text-shadow: -2px 0 #ff00ea, 2px 0 #39FF14; }
					100% { text-shadow: 2px 0 #39FF14, -2px 0 #ff00ea; }
				}
			`}</style>
		</div>
	);
}
