import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getStripe } from "./stripe.server";

export async function checkBalance(
	env: Env,
	organizationId: string,
): Promise<number> {
	const db = drizzle(env.DB, { schema });

	const org = await db.query.organization.findFirst({
		where: (org, { eq }) => eq(org.id, organizationId),
		columns: {
			credits: true,
		},
	});

	return org?.credits ?? 0;
}

export async function deductCredits(
	env: Env,
	organizationId: string,
	userId: string, // Keep userId for audit trail
	cost: number,
	reason: string,
) {
	if (cost <= 0) {
		throw new Error("Cost must be positive");
	}

	const now = Math.floor(Date.now() / 1000);
	const result = await env.DB.prepare(
		`WITH updated AS (
			UPDATE organization
			SET credits = credits - ?
			WHERE id = ? AND credits >= ?
			RETURNING id
		)
		INSERT INTO ledger (id, organization_id, user_id, amount, reason, created_at)
		SELECT ?, ?, ?, ?, ?, ?
		WHERE EXISTS (SELECT 1 FROM updated);`,
	)
		.bind(
			cost,
			organizationId,
			cost,
			crypto.randomUUID(),
			organizationId,
			userId,
			-cost,
			reason,
			now,
		)
		.run();

	if ((result.meta?.changes ?? 0) === 0) {
		throw new Error("Insufficient credits");
	}
}

export async function addCredits(
	env: Env,
	organizationId: string,
	userId: string | null, // Optional user ID for audit
	amount: number,
	reason: string,
	metadata?: { sessionId?: string },
) {
	if (amount <= 0) {
		throw new Error("Amount must be positive");
	}

	const db = drizzle(env.DB, { schema });

	// 1. Check for idempotency: has this sessionId already been processed?
	if (metadata?.sessionId) {
		const existing = await db.query.ledger.findFirst({
			where: (ledger, { and, eq }) =>
				and(
					eq(ledger.organizationId, organizationId),
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
			.update(schema.organization)
			.set({ credits: sql`${schema.organization.credits} + ${amount}` })
			.where(eq(schema.organization.id, organizationId)),
		db.insert(schema.ledger).values({
			organizationId,
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
	const userId = session.metadata?.userId; // Who made the purchase
	const organizationId = session.metadata?.organizationId; // Who gets the credits
	const creditsStr = session.metadata?.credits;

	if (!organizationId || !creditsStr) {
		throw new Error(`Session ${sessionId} missing metadata`);
	}

	const credits = Number.parseInt(creditsStr, 10);

	// 3. Fulfill credits (Idempotent)
	await addCredits(
		env,
		organizationId,
		userId || null,
		credits,
		"Stripe Purchase",
		{
			sessionId: session.id,
		},
	);

	return {
		success: true,
		userId,
		organizationId,
		credits,
	};
}
