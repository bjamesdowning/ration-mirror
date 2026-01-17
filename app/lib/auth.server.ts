// @ts-nocheck
import { drizzle } from "drizzle-orm/d1";
import { redirect } from "react-router";
import type { Route } from "../+types/root";
import * as schema from "../db/schema";

// TODO: Update this with your actual email address
const ADMIN_EMAIL = "admin@ration.com";

export async function ensureUserExists(
	env: Env,
	clerkId: string,
	email: string,
) {
	const db = drizzle(env.DB, { schema });

	// Check if user exists
	const existingUser = await db.query.users.findFirst({
		where: (users, { eq }) => eq(users.id, clerkId),
	});

	if (existingUser) {
		return existingUser;
	}

	// Create new user with 100 free credits (Welcome Bonus)
	const newUser = {
		id: clerkId,
		email,
		settings: "{}",
		credits: 100,
	};

	await db.insert(schema.users).values(newUser);

	return newUser;
}

export async function requireAdmin(
	context: Route.LoaderArgs["context"],
	_request: Request,
	userId: string,
) {
	const env = context.env as Env;
	const db = drizzle(env.DB, { schema });

	const user = await db.query.users.findFirst({
		where: (users, { eq }) => eq(users.id, userId),
	});

	if (!user || user.email !== ADMIN_EMAIL) {
		throw redirect("/");
	}

	return user;
}
