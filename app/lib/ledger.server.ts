import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export async function checkBalance(env: Env, userId: string): Promise<number> {
	const db = drizzle(env.DB, { schema });

	const user = await db.query.users.findFirst({
		where: (users, { eq }) => eq(users.id, userId),
		columns: {
			credits: true,
		},
	});

	return user?.credits ?? 0;
}

export async function deductCredits(
	env: Env,
	userId: string,
	cost: number,
	reason: string,
) {
	const db = drizzle(env.DB, { schema });

	await db.transaction(async (tx) => {
		// 1. Get current balance with a fresh read
		// Note: D1 doesn't support 'FOR UPDATE' locks in the same way as Postgres,
		// but transactions inside a single worker invocation are generally safe.
		// However, for strict consistency, we should verify inside the transaction.

		const user = await tx.query.users.findFirst({
			where: (users, { eq }) => eq(users.id, userId),
			columns: {
				credits: true,
			},
		});

		if (!user) {
			throw new Error("User not found");
		}

		if (user.credits < cost) {
			throw new Error("Insufficient credits"); // 402 Payment Required scenario
		}

		// 2. Deduct credits
		await tx
			.update(schema.users)
			.set({ credits: sql`${schema.users.credits} - ${cost}` })
			.where(eq(schema.users.id, userId));

		// 3. Record in ledger
		await tx.insert(schema.ledger).values({
			userId,
			amount: -cost, // Negative for deduction
			reason,
		});
	});
}
