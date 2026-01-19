// @ts-nocheck
import { useState } from "react";
// @ts-expect-error
import { useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";

export default function SignUpPage() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError("");
		await authClient.signUp.email(
			{
				email,
				password,
				name,
			},
			{
				onSuccess: () => {
					navigate("/dashboard");
				},
				onError: (ctx) => {
					setError(ctx.error.message);
					setLoading(false);
				},
			},
		);
	};

	return (
		<div className="flex items-center justify-center min-h-screen bg-[#051105] text-[#39FF14] font-mono">
			<div className="w-full max-w-md p-8 border border-[#39FF14]/30 relative">
				{/* Decorative Corner Markers */}
				<div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#39FF14]" />
				<div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#39FF14]" />
				<div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#39FF14]" />
				<div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#39FF14]" />

				<h1 className="text-2xl font-bold mb-8 tracking-widest uppercase border-b border-[#39FF14]/30 pb-4">
					Protocol_Registration
				</h1>

				<form onSubmit={handleSubmit} className="space-y-6">
					<div>
						<label
							htmlFor="name"
							className="block text-xs uppercase tracking-widest mb-2 opacity-70"
						>
							Designation (Name)
						</label>
						<input
							id="name"
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="w-full bg-black/50 border border-[#39FF14]/30 p-3 text-[#39FF14] focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-all placeholder-[#39FF14]/20"
							placeholder="UNIT-734"
							required
						/>
					</div>

					<div>
						<label
							htmlFor="email"
							className="block text-xs uppercase tracking-widest mb-2 opacity-70"
						>
							Identity (Email)
						</label>
						<input
							id="email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className="w-full bg-black/50 border border-[#39FF14]/30 p-3 text-[#39FF14] focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-all placeholder-[#39FF14]/20"
							placeholder="OPERATOR@RATION.COM"
							required
						/>
					</div>

					<div>
						<label
							htmlFor="password"
							className="block text-xs uppercase tracking-widest mb-2 opacity-70"
						>
							Access Key (Password)
						</label>
						<input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className="w-full bg-black/50 border border-[#39FF14]/30 p-3 text-[#39FF14] focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/50 transition-all placeholder-[#39FF14]/20"
							placeholder="••••••••"
							required
						/>
					</div>

					{error && (
						<div className="bg-red-900/20 border border-red-500/50 p-3 text-red-400 text-xs tracking-widest uppercase">
							Error: {error}
						</div>
					)}

					<button
						type="submit"
						disabled={loading}
						className="w-full bg-[#39FF14] text-black font-bold uppercase tracking-[0.2em] py-4 hover:bg-transparent hover:text-[#39FF14] border border-[#39FF14] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{loading ? "Register Credentials" : "Initialize Account"}
					</button>
				</form>

				<div className="mt-8 text-center text-xs opacity-50 uppercase tracking-widest">
					Has clearance?{" "}
					<a href="/sign-in" className="underline hover:text-white">
						Access Terminal
					</a>
				</div>
			</div>
		</div>
	);
}
