import type { AppLoadContext } from "react-router";
import { Welcome } from "../welcome/welcome";
import type { Route } from "./+types/home";
import "../../load-context"; // Ensure augmentation is loaded

export function meta(_: Route.MetaArgs) {
	return [
		{ title: "New React Router App" },
		{ name: "description", content: "Welcome to React Router!" },
	];
}

export function loader({ context }: Route.LoaderArgs) {
	// @ts-expect-error - context type augmentation is fighting with us
	const { env } = (context as AppLoadContext).cloudflare;
	return { message: env.VALUE_FROM_CLOUDFLARE };
}

export default function Home({ loaderData }: Route.ComponentProps) {
	return <Welcome message={loaderData.message} />;
}
