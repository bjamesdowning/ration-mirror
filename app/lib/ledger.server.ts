// @ts-nocheck
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getStripe } from "./stripe.server";

export async function checkBalance(env: Env, userId: string): Promise<number> {
	const db = drizzle(env.DB, { schema });

	const user = await db.query.user.findFirst({
		where: (user, { eq }) => eq(user.id, userId),
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

	// 1. Pre-check balance (simple read, no transaction needed)
	const user = await db.query.user.findFirst({
		where: (user, { eq }) => eq(user.id, userId),
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

	// 2. Execute both writes atomically via D1 batch API
	// D1 doesn't support traditional transactions via BEGIN/COMMIT,
	// but batch() provides atomic execution of multiple statements
	await db.batch([
		db
			.update(schema.user)
			.set({ credits: sql`${schema.user.credits} - ${cost}` })
			.where(eq(schema.user.id, userId)),
		db.insert(schema.ledger).values({
			userId,
			amount: -cost, // Negative for deduction
			reason,
		}),
	]);
}

export async function addCredits(
	env: Env,
	userId: string,
	amount: number,
	reason: string,
	metadata?: { sessionId?: string },
) {
	const db = drizzle(env.DB, { schema });

	// 1. Check for idempotency: has this sessionId already been processed?
	if (metadata?.sessionId) {
		const existing = await db.query.ledger.findFirst({
			where: (ledger, { and, eq }) =>
				and(
					eq(ledger.userId, userId),
					eq(ledger.reason, `${reason}:${metadata.sessionId}`),
				),
		});

		if (existing) {
			console.warn(
				`Duplicate credit add attempt for session ${metadata.sessionId}`,
			);
			return; // Already processed, skip
		}
	}

	// 2. Prepare ledger reason (include sessionId for idempotency)
	const ledgerReason = metadata?.sessionId
		? `${reason}:${metadata.sessionId}`
		: reason;

	// 3. Execute both writes atomically via D1 batch API
	await db.batch([
		db
			.update(schema.user)
			.set({ credits: sql`${schema.user.credits} + ${amount}` })
			.where(eq(schema.user.id, userId)),
		db.insert(schema.ledger).values({
			userId,
			amount, // Positive for addition
			reason: ledgerReason,
		}),
	]);
}

export async function processCheckoutSession(env: Env, sessionId: string) {
	const stripe = getStripe(env);

	// 1. Fetch session from Stripe to verify status
	const session = await stripe.checkout.sessions.retrieve(sessionId);

	if (session.payment_status !== "paid") {
		throw new Error(`Session ${sessionId} is not paid`);
	}

	// 2. Extract metadata
	const userId = session.metadata?.userId;
	const creditsStr = session.metadata?.credits;

	if (!userId || !creditsStr) {
		throw new Error(`Session ${sessionId} missing metadata`);
	}

	const credits = Number.parseInt(creditsStr, 10);

	// 3. Fulfill credits (Idempotent)
	await addCredits(env, userId, credits, "Stripe Purchase", {
		sessionId: session.id,
	});

	return {
		success: true,
		userId,
		credits,
	};
}
