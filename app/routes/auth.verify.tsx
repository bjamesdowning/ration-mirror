/**
 * Magic Link Verification Route
 *
 * This is the landing page that users arrive at when they click their
 * magic link email. Better Auth's `magicLink` plugin generates URLs
 * in the format `/api/auth/magic-link/verify?token=<token>&callbackURL=<url>`
 * and handles all the server-side verification internally.
 *
 * This route handles /auth/verify. Error scenarios (expired token, already-used
 * token) redirect here with an `?error=` query parameter. When there is no
 * error and the user is not authenticated, we redirect to / (root) so
 * unauthenticated users always land on the sign-in page.
 */
import { useEffect, useState } from "react";
import {
	Link,
	type LoaderFunctionArgs,
	redirect,
	useNavigate,
	useSearchParams,
} from "react-router";
import { getAuth } from "~/lib/auth.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	const error = url.searchParams.get("error");

	// Error state: show error UI (user came from failed magic link verification)
	if (error) return {};

	// No error: user may have manually navigated here. If not authenticated,
	// redirect to root so unauthenticated users always land on sign-in.
	const auth = getAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		throw redirect("/");
	}

	return {};
}

export function meta() {
	return [
		{ title: "Signing in — Ration" },
		{ name: "robots", content: "noindex" },
	];
}

const ERROR_MESSAGES: Record<string, string> = {
	INVALID_TOKEN: "This sign-in link is invalid or has already been used.",
	EXPIRED_TOKEN: "This sign-in link has expired. Please request a new one.",
	TOKEN_NOT_FOUND:
		"This sign-in link could not be found. Please request a new one.",
	ATTEMPTS_EXCEEDED: "Too many attempts. Please request a new sign-in link.",
};

export default function AuthVerify() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const error = searchParams.get("error");
	const [countdown, setCountdown] = useState(3);

	// If no error, auto-redirect to hub
	useEffect(() => {
		if (error) return;
		const interval = setInterval(() => {
			setCountdown((c) => {
				if (c <= 1) {
					clearInterval(interval);
					navigate("/hub");
				}
				return c - 1;
			});
		}, 1000);
		return () => clearInterval(interval);
	}, [error, navigate]);

	const errorMessage =
		error && (ERROR_MESSAGES[error] ?? "An unexpected error occurred.");

	return (
		<div className="min-h-screen bg-ceramic flex items-center justify-center p-6">
			<div className="w-full max-w-md">
				{/* Logo */}
				<div className="flex justify-center mb-8">
					<Link to="/">
						<img src="/static/ration-logo.svg" alt="Ration" className="h-16" />
					</Link>
				</div>

				<div className="glass-panel rounded-2xl p-8 shadow-xl text-center">
					{error ? (
						// Error state
						<>
							<div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-5">
								<svg
									className="w-7 h-7 text-danger"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<title>Error</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
									/>
								</svg>
							</div>
							<h1 className="text-display text-xl text-carbon mb-3">
								Link Invalid
							</h1>
							<p className="text-sm text-muted mb-6 leading-relaxed">
								{errorMessage}
							</p>
							<Link
								to="/"
								className="inline-flex items-center justify-center gap-2 w-full bg-hyper-green text-carbon font-bold py-3 px-6 rounded-xl hover:shadow-glow-sm transition-all focus-ring"
							>
								Request a new link
							</Link>
						</>
					) : (
						// Success state — auto redirecting
						<>
							<div className="w-14 h-14 rounded-full bg-hyper-green/10 flex items-center justify-center mx-auto mb-5">
								<svg
									className="w-7 h-7 text-hyper-green"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<title>Success</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M5 13l4 4L19 7"
									/>
								</svg>
							</div>
							<h1 className="text-display text-xl text-carbon mb-3">
								Signed in!
							</h1>
							<p className="text-sm text-muted mb-4">
								Taking you to your Cargo...{" "}
								<span className="font-mono text-hyper-green">{countdown}</span>
							</p>
							<Link
								to="/hub"
								className="text-xs text-muted hover:text-hyper-green transition-colors"
							>
								Click here if you're not redirected
							</Link>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
