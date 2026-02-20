// @ts-nocheck
import { useState } from "react";
import { Link } from "react-router";
import { authClient } from "~/lib/auth-client";
import { log } from "~/lib/logging.client";
import { AuthButton } from "./AuthButton";

type AuthMode = "signUp" | "signIn";

interface AuthWidgetProps {
	/** Default mode to display. Defaults to signUp for homepage, can be overridden for standalone pages */
	defaultMode?: AuthMode;
	/** Show the logo above the auth widget (used in standalone pages) */
	showLogo?: boolean;
	/** Show footer links below the widget (used in standalone pages) */
	showFooterLinks?: boolean;
}

export function AuthWidget({
	defaultMode = "signUp",
	showLogo = false,
	showFooterLinks = false,
}: AuthWidgetProps) {
	const [mode, setMode] = useState<AuthMode>(defaultMode);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const handleSocialAuth = async () => {
		setLoading(true);
		setError("");
		try {
			await authClient.signIn.social({
				provider: "google",
				callbackURL: "/hub",
			});
		} catch {
			setError(
				mode === "signUp"
					? "Registration failed. Please try again."
					: "Authentication failed. Please try again.",
			);
			setLoading(false);
		}
	};

	const handleDevLogin = async () => {
		setLoading(true);
		setError("");
		try {
			const result = await authClient.signIn.email({
				email: "dev@ration.app",
				password: "ration-dev",
				callbackURL: "/hub",
			});

			if (result.error) {
				// User doesn't exist, create them
				const signUpResult = await authClient.signUp.email({
					email: "dev@ration.app",
					password: "ration-dev",
					name: "Dev User",
					callbackURL: "/hub",
				});

				if (signUpResult.error) {
					throw new Error(signUpResult.error.message || "Dev signup failed");
				}
			}

			// Redirect to dashboard
			window.location.href = "/hub";
		} catch (err) {
			setError("Dev login failed. Please check the console.");
			log.error("Dev login error", err);
			setLoading(false);
		}
	};

	const heading = mode === "signUp" ? "Create Account" : "Welcome Back";
	const subheading =
		mode === "signUp"
			? "Get started with smart Cargo management"
			: "Sign in to access your Cargo";

	return (
		<div className="w-full max-w-md">
			{/* Optional Logo (for standalone pages) */}
			{showLogo && (
				<div className="flex justify-center mb-8">
					<Link to="/">
						<img src="/static/ration-logo.svg" alt="Ration" className="h-16" />
					</Link>
				</div>
			)}

			{/* Auth Card */}
			<div className="glass-panel rounded-2xl p-8 shadow-xl">
				{/* Tab Switcher */}
				<div
					className="flex gap-2 p-1 bg-platinum/50 rounded-xl mb-6"
					role="tablist"
					aria-label="Authentication mode"
				>
					<button
						type="button"
						role="tab"
						aria-selected={mode === "signUp"}
						aria-controls="signup-panel"
						id="signup-tab"
						onClick={() => setMode("signUp")}
						className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all focus-ring ${
							mode === "signUp"
								? "bg-hyper-green text-carbon shadow-glow-sm"
								: "text-muted hover:bg-platinum hover:text-carbon"
						}`}
					>
						Sign Up
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={mode === "signIn"}
						aria-controls="signin-panel"
						id="signin-tab"
						onClick={() => setMode("signIn")}
						className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all focus-ring ${
							mode === "signIn"
								? "bg-hyper-green text-carbon shadow-glow-sm"
								: "text-muted hover:bg-platinum hover:text-carbon"
						}`}
					>
						Sign In
					</button>
				</div>

				{/* Auth Panel */}
				<div
					role="tabpanel"
					id={mode === "signUp" ? "signup-panel" : "signin-panel"}
					aria-labelledby={mode === "signUp" ? "signup-tab" : "signin-tab"}
				>
					<h1 className="text-display text-2xl text-carbon mb-2 text-center">
						{heading}
					</h1>
					<p className="text-muted text-sm text-center mb-8">{subheading}</p>

					<AuthButton
						mode={mode}
						loading={loading}
						error={error}
						onAuthClick={handleSocialAuth}
					/>

					{/* Dev Login Button (only in dev mode) */}
					{import.meta.env.DEV && (
						<div className="mt-4">
							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<div className="w-full border-t border-muted/20" />
								</div>
								<div className="relative flex justify-center text-xs uppercase">
									<span className="bg-ceramic px-2 text-muted">Dev Mode</span>
								</div>
							</div>
							<button
								type="button"
								onClick={handleDevLogin}
								disabled={loading}
								className="mt-4 w-full py-3 px-4 rounded-xl font-mono text-sm bg-carbon text-ceramic hover:bg-carbon/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-hyper-green/30"
							>
								{loading ? "..." : "⚡ Dev Login"}
							</button>
							<p className="mt-2 text-xs text-muted text-center font-mono">
								dev@ration.app
							</p>
						</div>
					)}

					{mode === "signUp" && (
						<p className="mt-6 text-xs text-muted text-center">
							By signing up, you agree to our{" "}
							<Link
								to="/legal/terms"
								className="text-hyper-green hover:text-hyper-green/80"
							>
								Terms of Service
							</Link>
							{" and "}
							<Link
								to="/legal/privacy"
								className="text-hyper-green hover:text-hyper-green/80"
							>
								Privacy Policy
							</Link>
						</p>
					)}
				</div>
			</div>

			{/* Optional Footer Links (for standalone pages) */}
			{showFooterLinks && (
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
			)}
		</div>
	);
}
