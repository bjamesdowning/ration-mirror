import { useState } from "react";
import { Link } from "react-router";
import { authClient } from "~/lib/auth-client";
import { log } from "~/lib/logging.client";

type FlowState = "idle" | "sending" | "sent" | "error";
type AuthMode = "signUp" | "signIn";

interface AuthWidgetProps {
	/** Default mode to display. Defaults to signUp for homepage. */
	defaultMode?: AuthMode;
	/** Show the logo above the auth widget (used in standalone pages) */
	showLogo?: boolean;
	/** Show footer links below the widget (used in standalone pages) */
	showFooterLinks?: boolean;
	/** Optional contextual message (e.g. when arriving from pricing CTA) */
	intentMessage?: string;
}

export function AuthWidget({
	defaultMode = "signUp",
	showLogo = false,
	showFooterLinks = false,
	intentMessage,
}: AuthWidgetProps) {
	const [mode, setMode] = useState<AuthMode>(defaultMode);
	const [email, setEmail] = useState("");
	const [flowState, setFlowState] = useState<FlowState>("idle");
	const [errorMsg, setErrorMsg] = useState("");
	const [socialLoading, setSocialLoading] = useState(false);
	const [devLoginLoading, setDevLoginLoading] = useState(false);

	const isDev = import.meta.env.DEV;
	const isLoading = flowState === "sending" || socialLoading || devLoginLoading;

	/** RFC 5322–style regex for basic email validation (relaxed for real-world use) */
	const isValidEmail = (value: string): boolean =>
		/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

	const handleMagicLink = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = email.trim();
		if (!trimmed || isLoading) return;

		if (!isValidEmail(trimmed)) {
			setErrorMsg("Please enter a valid email address.");
			setFlowState("error");
			return;
		}

		setFlowState("sending");
		setErrorMsg("");

		try {
			const { error } = await authClient.signIn.magicLink({
				email: trimmed,
				callbackURL: "/hub",
				newUserCallbackURL: "/hub",
				errorCallbackURL: "/auth/verify",
			});

			if (error) {
				setFlowState("error");
				setErrorMsg("Something went wrong. Please try again.");
				return;
			}

			setFlowState("sent");
		} catch (err) {
			setFlowState("error");
			setErrorMsg("Something went wrong. Please try again.");
			log.error("Magic link request failed", {
				message: err instanceof Error ? err.message : "Unknown error",
			});
		}
	};

	const handleGoogleAuth = async () => {
		setSocialLoading(true);
		setErrorMsg("");
		try {
			await authClient.signIn.social({
				provider: "google",
				callbackURL: "/hub",
			});
		} catch {
			setErrorMsg("Google sign-in failed. Please try again.");
			setSocialLoading(false);
		}
	};

	const handleDevLogin = async () => {
		if (!isDev) return;
		setDevLoginLoading(true);
		setErrorMsg("");
		try {
			const { error } = await authClient.signIn.email({
				email: "dev@ration.app",
				password: "ration-dev",
				callbackURL: "/hub",
			});
			if (error) {
				// Dev user may not exist yet — try signup
				const signUpResult = await authClient.signUp.email({
					name: "Dev User",
					email: "dev@ration.app",
					password: "ration-dev",
					callbackURL: "/hub",
				});
				if (signUpResult.error) {
					setErrorMsg(
						"Dev login failed. Ensure dev@ration.app exists with password ration-dev.",
					);
				}
			}
		} catch (err) {
			setErrorMsg("Dev login failed. Please try again.");
			log.error("Dev login failed", {
				message: err instanceof Error ? err.message : "Unknown error",
			});
		} finally {
			setDevLoginLoading(false);
		}
	};

	const handleTryAgain = () => {
		setFlowState("idle");
		setErrorMsg("");
	};

	// ── "Check your email" success state ─────────────────────────────────────
	if (flowState === "sent") {
		return (
			<div className="w-full max-w-md">
				{showLogo && (
					<div className="flex justify-center mb-8">
						<Link to="/">
							<img
								src="/static/ration-logo.svg"
								alt="Ration"
								className="h-16"
							/>
						</Link>
					</div>
				)}
				<div className="glass-panel rounded-2xl p-8 shadow-xl text-center">
					<div className="w-14 h-14 rounded-full bg-hyper-green/10 flex items-center justify-center mx-auto mb-5">
						<svg
							className="w-7 h-7 text-hyper-green"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<title>Email sent</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
							/>
						</svg>
					</div>
					<h2 className="text-display text-xl text-carbon mb-2">
						Check your inbox
					</h2>
					<p className="text-sm text-muted mb-1 leading-relaxed">
						We sent a sign-in link to
					</p>
					<p className="text-sm font-mono text-carbon font-semibold mb-5 break-all">
						{email}
					</p>
					<p className="text-xs text-muted mb-6">
						The link expires in 5 minutes. Check your spam folder if you don't
						see it.
					</p>
					<button
						type="button"
						onClick={handleTryAgain}
						className="text-xs text-muted hover:text-hyper-green transition-colors underline underline-offset-2"
					>
						Use a different email
					</button>
				</div>
				{showFooterLinks && <FooterLinks />}
			</div>
		);
	}

	// ── Main auth widget ──────────────────────────────────────────────────────
	return (
		<div className="w-full max-w-md">
			{showLogo && (
				<div className="flex justify-center mb-8">
					<Link to="/">
						<img src="/static/ration-logo.svg" alt="Ration" className="h-16" />
					</Link>
				</div>
			)}

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
						id="signup-tab"
						aria-controls="auth-panel"
						onClick={() => {
							setMode("signUp");
							handleTryAgain();
						}}
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
						id="signin-tab"
						aria-controls="auth-panel"
						onClick={() => {
							setMode("signIn");
							handleTryAgain();
						}}
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
					id="auth-panel"
					aria-labelledby={mode === "signUp" ? "signup-tab" : "signin-tab"}
				>
					<h1 className="text-display text-2xl text-carbon mb-1 text-center">
						{mode === "signUp" ? "Create Account" : "Welcome Back"}
					</h1>
					<p className="text-muted text-sm text-center mb-6">
						{mode === "signUp"
							? "Enter your email to get started"
							: "Enter your email to sign in"}
					</p>
					{intentMessage && (
						<p className="text-hyper-green/90 text-sm text-center mb-4 font-medium">
							{intentMessage}
						</p>
					)}

					{/* Error banner */}
					{(errorMsg || flowState === "error") && (
						<div
							className="bg-danger/10 border border-danger/20 rounded-lg p-3 text-danger text-sm mb-4"
							role="alert"
							aria-live="polite"
						>
							{errorMsg || "Something went wrong. Please try again."}
						</div>
					)}

					{/* Magic Link Form */}
					<form onSubmit={handleMagicLink} className="space-y-3">
						<div>
							<label htmlFor="auth-email" className="sr-only">
								Email address
							</label>
							<input
								id="auth-email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="your@email.com"
								required
								autoComplete="email"
								disabled={isLoading}
								className="w-full px-4 py-3 rounded-xl border border-carbon/10 bg-white/60 text-carbon placeholder:text-carbon/40 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-hyper-green/50 focus:border-hyper-green transition-all disabled:opacity-50"
							/>
						</div>
						<button
							type="submit"
							disabled={
								isLoading || !email.trim() || !isValidEmail(email.trim())
							}
							className="w-full bg-hyper-green text-carbon font-bold py-3.5 px-6 rounded-xl shadow-glow hover:shadow-glow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-ring"
						>
							{flowState === "sending" ? (
								<>
									<span
										className="w-4 h-4 border-2 border-carbon/30 border-t-carbon rounded-full animate-spin"
										aria-hidden="true"
									/>
									Sending link...
								</>
							) : (
								<>
									<svg
										className="w-4 h-4"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<title>Email</title>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
										/>
									</svg>
									{mode === "signUp"
										? "Send Sign-up Link"
										: "Send Sign-in Link"}
								</>
							)}
						</button>
					</form>

					{/* Dev Login — only in dev mode (bun run dev / dev:remote) */}
					{isDev && (
						<>
							<div className="relative my-5">
								<div className="absolute inset-0 flex items-center">
									<div className="w-full border-t border-carbon/10" />
								</div>
								<div className="relative flex justify-center text-xs uppercase">
									<span className="bg-white/60 px-2 text-muted">
										or dev testing
									</span>
								</div>
							</div>
							<button
								type="button"
								onClick={handleDevLogin}
								disabled={isLoading}
								className="w-full border border-dashed border-carbon/30 bg-platinum/30 text-carbon py-3 px-4 rounded-xl text-sm font-semibold hover:bg-platinum transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 focus-ring"
								aria-label="Dev Login (dev@ration.app)"
							>
								{devLoginLoading ? (
									<>
										<span
											className="w-4 h-4 border-2 border-carbon/20 border-t-carbon rounded-full animate-spin"
											aria-hidden="true"
										/>
										Signing in...
									</>
								) : (
									"Dev Login"
								)}
							</button>
						</>
					)}

					{/* Google OAuth — always shown when auth is available */}
					<div className="relative my-5">
						<div className="absolute inset-0 flex items-center">
							<div className="w-full border-t border-carbon/10" />
						</div>
						<div className="relative flex justify-center text-xs uppercase">
							<span className="bg-white/60 px-2 text-muted">
								or continue with
							</span>
						</div>
					</div>
					<button
						type="button"
						onClick={handleGoogleAuth}
						disabled={isLoading}
						className="w-full border border-carbon/10 bg-white/60 text-carbon py-3 px-4 rounded-xl text-sm font-semibold hover:bg-platinum transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 focus-ring"
					>
						{socialLoading ? (
							<>
								<span
									className="w-4 h-4 border-2 border-carbon/20 border-t-carbon rounded-full animate-spin"
									aria-hidden="true"
								/>
								Connecting...
							</>
						) : (
							<>
								<svg
									viewBox="0 0 24 24"
									className="w-4 h-4"
									xmlns="http://www.w3.org/2000/svg"
									aria-hidden="true"
								>
									<title>Google</title>
									<path
										d="M12.48 10.92v3.28h7.84c-.24 1.84-.908 3.152-1.928 4.176-1.288 1.288-3.232 2.768-6.192 2.768-4.744 0-8.432-3.832-8.432-8.576s3.688-8.576 8.432-8.576c2.56 0 4.416.992 5.8 2.312l2.312-2.312C18.152 2.032 15.544.928 12.48.928c-6.136 0-11.232 4.968-11.232 11.104s5.096 11.104 11.232 11.104c3.312 0 5.8-1.088 7.792-3.152 2.056-2.056 2.712-4.904 2.712-7.232 0-.696-.056-1.352-.16-1.928h-8.064z"
										fill="currentColor"
									/>
								</svg>
								Continue with Google
							</>
						)}
					</button>

					{mode === "signUp" && (
						<p className="mt-5 text-xs text-muted text-center">
							By signing up, you agree to our{" "}
							<Link
								to="/legal/terms"
								className="text-hyper-green hover:text-hyper-green/80"
							>
								Terms of Service
							</Link>{" "}
							and{" "}
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

			{showFooterLinks && <FooterLinks />}
		</div>
	);
}

function FooterLinks() {
	return (
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
	);
}
