// @ts-nocheck
import { useState } from "react";
import { Link } from "react-router";
import { authClient } from "~/lib/auth-client";

export default function SignInPage() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	return (
		<div className="flex items-center justify-center min-h-screen bg-ceramic">
			<div className="w-full max-w-md p-8">
				{/* Logo */}
				<div className="flex justify-center mb-8">
					<Link to="/">
						<img
							src="/static/ration-logo-final-no-background-small.png"
							alt="Ration"
							className="h-16"
						/>
					</Link>
				</div>

				{/* Auth Card */}
				<div className="glass-panel rounded-2xl p-8 shadow-xl">
					<h1 className="text-display text-2xl text-carbon mb-2 text-center">
						Welcome Back
					</h1>
					<p className="text-muted text-sm text-center mb-8">
						Sign in to access your pantry
					</p>

					<div className="space-y-6">
						{error && (
							<div className="bg-danger/10 border border-danger/20 rounded-lg p-3 text-danger text-sm">
								{error}
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
									setError("Authentication failed. Please try again.");
									setLoading(false);
								}
							}}
							disabled={loading}
							className="w-full bg-hyper-green text-carbon font-bold py-4 px-6 rounded-xl shadow-glow hover:shadow-glow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
						>
							{loading ? (
								<>
									<span className="w-5 h-5 border-2 border-carbon/30 border-t-carbon rounded-full animate-spin" />
									Signing in...
								</>
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
									Continue with Google
								</>
							)}
						</button>
					</div>

					<div className="mt-8 text-center text-sm text-muted">
						Don't have an account?{" "}
						<Link
							to="/sign-up"
							className="text-hyper-green hover:text-hyper-green/80 font-medium"
						>
							Sign up
						</Link>
					</div>
				</div>

				{/* Footer Links */}
				<div className="mt-6 text-center text-xs text-muted">
					<Link
						to="/legal/privacy"
						className="hover:text-hyper-green transition-colors"
					>
						Privacy Policy
					</Link>
					<span className="mx-2">•</span>
					<Link
						to="/legal/terms"
						className="hover:text-hyper-green transition-colors"
					>
						Terms of Service
					</Link>
				</div>
			</div>
		</div>
	);
}
