/** Sort Drizzle SQL filenames the way wrangler `d1 migrations apply` does. */
export function compareMigrationNames(a: string, b: string): number {
	const num = (name: string) => {
		const match = name.match(/^(\d+)/);
		return match ? Number(match[1]) : 0;
	};
	const delta = num(a) - num(b);
	if (delta !== 0) return delta;
	return a.localeCompare(b);
}

export function splitDrizzleStatements(sql: string): string[] {
	return sql
		.split("--> statement-breakpoint")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}
