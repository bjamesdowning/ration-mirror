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

import type { Route } from "./+types/root";
import "./app.css";
import { ClerkProvider } from "@clerk/react-router";
import { createClerkClient } from "@clerk/react-router/api.server";
import { rootAuthLoader } from "@clerk/react-router/ssr.server";
import { Status } from "./components/hud/Status";
import { ensureUserExists } from "./lib/auth.server";

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

export async function loader(args: Route.LoaderArgs) {
	return rootAuthLoader(args, async ({ context, auth }) => {
		const { env } = context;
		let credits = 0;

		// If user is authenticated, ensure they exist in our DB
		if (auth.userId) {
			try {
				const clerk = createClerkClient({
					secretKey: env.CLERK_SECRET_KEY,
					publishableKey: env.CLERK_PUBLISHABLE_KEY,
				});

				const user = await clerk.users.getUser(auth.userId);
				const primaryEmail = user.emailAddresses.find(
					(e) => e.id === user.primaryEmailAddressId,
				)?.emailAddress;

				if (primaryEmail) {
					try {
						const dbUser = await ensureUserExists(
							env,
							auth.userId,
							primaryEmail,
						);
						credits = dbUser.credits;
					} catch (e) {
						console.error("Failed to sync user", e);
					}
				}
			} catch (e) {
				console.error("Failed to fetch user from Clerk", e);
			}
		}

		return {
			clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY,
			credits,
		};
	});
}

export function Layout({ children }: { children: React.ReactNode }) {
	const loaderData = useLoaderData<typeof loader>();

	return (
		<ClerkProvider
			loaderData={loaderData}
			publishableKey={loaderData?.clerkPublishableKey}
		>
			<html lang="en">
				<head>
					<meta charSet="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<Meta />
					<Links />
				</head>
				<body className="bg-[#051105] text-white">
					<Status credits={loaderData?.credits} />
					{children}
					<ScrollRestoration />
					<Scripts />
				</body>
			</html>
		</ClerkProvider>
	);
}

export default function App() {
	return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404" : "Error";
		details =
			error.status === 404
				? "The requested page could not be found."
				: error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main className="pt-16 p-4 container mx-auto text-white">
			<h1 className="text-2xl font-bold">{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre className="w-full p-4 overflow-x-auto bg-black/50 mt-4 text-xs">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
