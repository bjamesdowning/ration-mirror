// @ts-nocheck
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLoaderData,
} from "react-router";

import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";

import type { Route } from "./+types/root";
import "./app.css";
import { Status } from "./components/hud/Status";
import { createAuth } from "./lib/auth.server";

export const links: Route.LinksFunction = () => [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous",
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
	},
];

export const loader = async ({ request, context }: Route.LoaderArgs) => {
	const auth = createAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });

	let credits = 0;
	if (session?.user) {
		// In Better Auth schema we added credits to user table, so it should be available in session.user
		// but by default getSession returns basic user fields.
		// Since we extended the schema, Better Auth might return it if typed correctly.
		// However, for safety/guarantee, we might want to cast or it just works.
		// For now let's assume it's in user object or 0.
		credits = (session.user as { credits?: number }).credits || 0;
	}

	return {
		user: session?.user,
		credits,
	};
};

export function Layout({ children }: { children: React.ReactNode }) {
	const loaderData = useLoaderData<typeof loader>();

	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body className="bg-ceramic text-carbon">
				<Status credits={loaderData?.credits} />
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "SYSTEM FAILURE";
	let details = "UNEXPECTED ANOMALY DETECTED.";
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404 :: NOT FOUND" : "SYSTEM ERROR";
		details =
			error.status === 404
				? "THE REQUESTED RESOURCE COULD NOT BE LOCATED IN THE DATABANKS."
				: error.statusText || details;
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
