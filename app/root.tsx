import { useEffect } from "react";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLoaderData,
	useRouteLoaderData,
} from "react-router";

import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";

import type { Route } from "./+types/root";
import "./app.css";
import { WebMcpProvider } from "./components/agent/WebMcpProvider";
import { AGENT_DISCOVERY_LINK_HEADER } from "./lib/agent-readiness";
import { hasAppleWebCredentials } from "./lib/apple-web-login.server";
import { createAuth } from "./lib/auth.server";
import { runRouteLoader } from "./lib/error-handler";
import {
	buildFlagContext,
	getClientSafeFlags,
} from "./lib/feature-flags/flags.server";
import { resolveAppTheme } from "./lib/theme";

export const links: Route.LinksFunction = () => [
	{ rel: "icon", href: "/favicon.ico" },
	{ rel: "manifest", href: "/manifest.webmanifest" },
	{
		rel: "apple-touch-icon",
		href: "/static/ration-logo.svg",
	},
];

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	return runRouteLoader(async () => {
		// Fast path: read theme from cookie (no DB hit)
		const cookieHeader = request.headers.get("Cookie") || "";
		const cookieTheme = cookieHeader.match(/theme=(light|dark)/)?.[1] as
			| "light"
			| "dark"
			| undefined;

		const auth = createAuth(context.cloudflare.env);
		const session = await auth.api.getSession({ headers: request.headers });

		// Session theme as fallback (now available via additionalFields)
		const sessionTheme = (
			session?.user?.settings as { theme?: "light" | "dark" }
		)?.theme;

		// Logged-in users: DB/session is source of truth (mobile PATCH may update
		// theme without refreshing the web cookie). Guests rely on cookie only.
		const resolvedTheme = resolveAppTheme({
			isAuthenticated: session?.user != null,
			sessionTheme,
			cookieTheme,
		});

		const env = context.cloudflare.env;
		const activeOrganizationId = session?.session?.activeOrganizationId ?? null;

		const url = new URL(request.url);
		const flagContext = buildFlagContext(request, env, session);
		const clientFlags = await getClientSafeFlags(env, flagContext);
		clientFlags.appleWebLogin =
			clientFlags.appleWebLogin === true && hasAppleWebCredentials(env);

		return {
			user: session?.user,
			theme: resolvedTheme,
			origin: url.origin,
			activeOrganizationId,
			clientFlags,
		};
	});
};

/** Merged with Stripe, Cloudflare Insights, and Ration Copilot. */
const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
	"img-src 'self' data: blob:",
	"font-src 'self' https://fonts.gstatic.com",
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"script-src 'self' 'unsafe-inline' https://js.stripe.com https://static.cloudflareinsights.com",
	"connect-src 'self' https://api.stripe.com https://cloudflareinsights.com https://copilot.ration.mayutic.com wss://copilot.ration.mayutic.com",
	"media-src 'self'",
	"frame-src https://js.stripe.com https://hooks.stripe.com https://www.youtube.com https://player.vimeo.com https://fast.wistia.net",
].join("; ");

export const headers: Route.HeadersFunction = () => ({
	"Content-Security-Policy": CONTENT_SECURITY_POLICY,
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	Link: AGENT_DISCOVERY_LINK_HEADER,
	Vary: "Accept",
});

export function Layout({ children }: { children: React.ReactNode }) {
	const data = useRouteLoaderData<typeof loader>("root");
	const themeClass = data?.theme === "dark" ? "dark" : "";

	return (
		<html lang="en" className={themeClass}>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="theme-color" content="#00E088" />
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<meta name="apple-mobile-web-app-title" content="Ration" />
				<Meta />
				<Links />
			</head>
			<body className="bg-ceramic text-carbon">
				{children}
				<WebMcpProvider />
				<ScrollRestoration />
				<Scripts />
				<script
					defer
					src="https://static.cloudflareinsights.com/beacon.min.js"
					data-cf-beacon='{"token": "7b90ccb44b2f4948895901eda6124107"}'
				/>
			</body>
		</html>
	);
}

export default function App() {
	const { theme } = useLoaderData<typeof loader>();

	// Apply theme class to document element after hydration
	useEffect(() => {
		if (theme === "dark") {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	}, [theme]);

	return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "SYSTEM FAILURE";
	let details = "UNEXPECTED ANOMALY DETECTED.";
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404 :: NOT FOUND" : "SYSTEM ERROR";
		const loaderMessage =
			typeof error.data === "object" &&
			error.data !== null &&
			"error" in error.data &&
			typeof (error.data as { error?: unknown }).error === "string"
				? (error.data as { error: string }).error
				: null;
		details =
			error.status === 404
				? "THE REQUESTED RESOURCE COULD NOT BE LOCATED IN THE DATABANKS."
				: (loaderMessage ?? error.statusText ?? details);
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main className="min-h-screen bg-[#051105] text-red-500 font-mono flex flex-col items-center justify-center p-4 relative overflow-hidden">
			{/* Scanline Effect */}
			<div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(255,0,0,0.03)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(255,0,0,0.02),rgba(255,0,0,0.06))] bg-[length:100%_4px,3px_100%] bg-repeat" />

			<div className="max-w-2xl w-full border border-red-500/50 p-8 relative bg-[#0f0505]">
				<div className="absolute top-0 left-0 w-2 h-2 bg-red-500" />
				<div className="absolute top-0 right-0 w-2 h-2 bg-red-500" />
				<div className="absolute bottom-0 left-0 w-2 h-2 bg-red-500" />
				<div className="absolute bottom-0 right-0 w-2 h-2 bg-red-500" />

				<h1
					className="text-4xl font-black mb-4 glitch-text"
					data-text={message}
				>
					{message}
				</h1>
				<div className="h-px bg-red-500/30 w-full mb-6" />
				<p className="text-lg mb-8 uppercase tracking-widest">{details}</p>

				{stack && (
					<pre className="w-full p-4 overflow-x-auto bg-black border border-red-900 mb-8 text-xs text-red-400">
						<code>{stack}</code>
					</pre>
				)}

				<button
					type="button"
					onClick={() => window.location.reload()}
					className="group relative px-8 py-3 bg-transparent border border-red-500 text-red-500 uppercase tracking-[0.2em] hover:bg-red-500 hover:text-black transition-all duration-100"
				>
					<span className="relative z-10">REBOOT SYSTEM</span>
				</button>
			</div>
		</main>
	);
}
