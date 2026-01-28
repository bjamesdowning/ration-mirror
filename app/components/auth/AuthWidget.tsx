// @ts-nocheck
import { useState } from "react";
import { Link } from "react-router";
import { authClient } from "~/lib/auth-client";
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

	const handleAuth = async () => {
		setLoading(true);
		setError("");
		try {
			await authClient.signIn.social({
				provider: "google",
				callbackURL: "/dashboard",
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

	const heading = mode === "signUp" ? "Create Account" : "Welcome Back";
	const subheading =
		mode === "signUp"
			? "Get started with smart pantry management"
			: "Sign in to access your pantry";

	return (
		<div className="w-full max-w-md">
			{/* Optional Logo (for standalone pages) */}
			{showLogo && (
				<div className="flex justify-center mb-8">
					<Link to="/">
						<img
							src="/static/ration-logo-final-no-background-small.png"
							alt="Ration"
							className="h-16"
						/>
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
						onAuthClick={handleAuth}
					/>

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
