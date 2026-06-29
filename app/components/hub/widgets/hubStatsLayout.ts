export function getHubStatsGridClass(size: "sm" | "md" | "lg"): string {
	switch (size) {
		case "sm":
			return "grid grid-cols-2 gap-2";
		case "md":
			return "grid grid-cols-2 gap-3 sm:grid-cols-3";
		case "lg":
			return "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5";
		default:
			return "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5";
	}
}
