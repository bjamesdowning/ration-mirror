import { Welcome } from "../welcome/welcome";
import type { Route } from "./+types/home";
import "../../load-context"; // Ensure augmentation is loaded

export function meta(_: Route.MetaArgs) {
	return [
		{ title: "New React Router App" },
		{ name: "description", content: "Welcome to React Router!" },
	];
}

export default function Home() {
	return <Welcome />;
}
