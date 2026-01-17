import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

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
