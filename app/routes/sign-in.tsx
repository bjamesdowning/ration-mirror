// @ts-nocheck
import { useState } from "react";
import { authClient } from "~/lib/auth-client";

export default function SignInPage() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	return (
		<div className="flex items-center justify-center min-h-screen bg-[#051105] text-[#39FF14] font-mono">
			<div className="w-full max-w-md p-8 border border-[#39FF14]/30 relative">
				{/* Decorative Corner Markers */}
				<div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#39FF14]" />
				<div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#39FF14]" />
				<div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#39FF14]" />
				<div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#39FF14]" />

				<h1 className="text-2xl font-bold mb-8 tracking-widest uppercase border-b border-[#39FF14]/30 pb-4">
					Protocol_Login
				</h1>

				<div className="space-y-6">
					<p className="text-sm opacity-70 leading-relaxed uppercase tracking-wider">
						Authorized personnel only. Biometric credentials required via Google
						Identity Link.
					</p>

					{error && (
						<div className="bg-red-900/20 border border-red-500/50 p-3 text-red-400 text-xs tracking-widest uppercase">
							Error: {error}
						</div>
					)}

					<button
						type="button"
						onClick={async () => {
							setLoading(true);
							setError("");
							try {
								await authClient.signIn.social({
									provider: "google",
									callbackURL: "/dashboard",
								});
							} catch {
								setError("Authorization protocol failed.");
								setLoading(false);
							}
						}}
						disabled={loading}
						className="w-full bg-[#39FF14] text-black font-bold uppercase tracking-[0.2em] py-4 hover:bg-transparent hover:text-[#39FF14] border border-[#39FF14] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
					>
						{loading ? (
							"Authorizing..."
						) : (
							<>
								<svg
									viewBox="0 0 24 24"
									className="w-5 h-5 fill-current"
									xmlns="http://www.w3.org/2000/svg"
									role="img"
									aria-label="Google logo"
								>
									<title>Google Logo</title>
									<path d="M12.48 10.92v3.28h7.84c-.24 1.84-.908 3.152-1.928 4.176-1.288 1.288-3.232 2.768-6.192 2.768-4.744 0-8.432-3.832-8.432-8.576s3.688-8.576 8.432-8.576c2.56 0 4.416.992 5.8 2.312l2.312-2.312C18.152 2.032 15.544.928 12.48.928c-6.136 0-11.232 4.968-11.232 11.104s5.096 11.104 11.232 11.104c3.312 0 5.8-1.088 7.792-3.152 2.056-2.056 2.712-4.904 2.712-7.232 0-.696-.056-1.352-.16-1.928h-8.064z" />
								</svg>
								Authorize via Google
							</>
						)}
					</button>
				</div>

				<div className="mt-8 text-center text-xs opacity-50 uppercase tracking-widest">
					No clearance?{" "}
					<a href="/sign-up" className="underline hover:text-white">
						Request Access
					</a>
				</div>
			</div>
		</div>
	);
}
