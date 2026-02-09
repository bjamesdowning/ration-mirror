import { like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { requireAdmin } from "~/lib/auth.server";
import type { Route } from "./+types/admin.users";

export async function loader({ request, context }: Route.LoaderArgs) {
	await requireAdmin(context, request);

	const url = new URL(request.url);
	const q = url.searchParams.get("q");

	if (!q || q.trim().length < 2) {
		return { users: [] };
	}

	const db = drizzle(context.cloudflare.env.DB, { schema });
	const searchPattern = `%${q.trim()}%`;

	const users = await db
		.select({
			id: schema.user.id,
			name: schema.user.name,
			email: schema.user.email,
			isAdmin: schema.user.isAdmin,
			createdAt: schema.user.createdAt,
		})
		.from(schema.user)
		.where(
			or(
				like(schema.user.name, searchPattern),
				like(schema.user.email, searchPattern),
			),
		)
		.limit(10);

	return { users };
}
