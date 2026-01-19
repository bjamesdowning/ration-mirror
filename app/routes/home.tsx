// @ts-nocheck
import type { Route } from "./+types/home";
import "../../load-context"; // Ensure augmentation is loaded

export function meta(_: Route.MetaArgs) {
	return [
		{ title: "RATION PROTOCOL /// INITIALIZE" },
		{ name: "description", content: "Orbital Supply Chain Management System" },
	];
}

export default function Home() {
	return (
		<div className="min-h-screen bg-[#051105] text-[#39FF14] font-mono selection:bg-[#39FF14] selection:text-[#051105] flex flex-col relative overflow-hidden">
			{/* Grid Background Effect */}
			<div
				className="absolute inset-0 pointer-events-none opacity-20"
				style={{
					backgroundImage: `linear-gradient(#39FF14 1px, transparent 1px), linear-gradient(90deg, #39FF14 1px, transparent 1px)`,
					backgroundSize: "40px 40px",
					maskImage: "linear-gradient(to bottom, black 40%, transparent 90%)",
				}}
			/>

			{/* Scanline Effect (CSS only) */}
			<div
				className="absolute inset-0 pointer-events-none opacity-10 mix-blend-overlay z-10"
				style={{
					background:
						"linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2))",
					backgroundSize: "100% 4px",
				}}
			/>

			{/* Main Content */}
			<main className="flex-1 flex flex-col items-center justify-center relative z-20 px-6">
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
							Orbital Supply Chain Management System
						</p>
					</div>

					{/* decorative status lines */}
					<div className="flex gap-8 text-[10px] uppercase tracking-[0.2em] opacity-60">
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
			</main>

			{/* Footer Status Bar */}
			<footer className="relative z-20 border-t border-[#39FF14]/30 bg-[#051105]/90 backdrop-blur-sm p-4">
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
