import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { isAgentStubEmail } from "~/lib/agent/stub-user";
import { WELCOME_CREDITS } from "~/lib/billing.constants";
import { addCredits } from "~/lib/ledger.server";
import { log, redactId } from "~/lib/logging.server";

/**
 * Grant one-time welcome credits to a human user's personal org.
 * Skips agent stub emails. Idempotent via ledger key + welcomeVoucherRedeemed.
 */
export async function grantWelcomeCreditsIfEligible(
	env: Env,
	input: {
		userId: string;
		organizationId: string;
		email: string;
	},
): Promise<boolean> {
	if (isAgentStubEmail(input.email)) {
		return false;
	}

	const db = drizzle(env.DB, { schema });
	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, input.userId),
		columns: { welcomeVoucherRedeemed: true, email: true },
	});

	if (!user || user.welcomeVoucherRedeemed) {
		return false;
	}

	if (isAgentStubEmail(user.email)) {
		return false;
	}

	try {
		await addCredits(
			env,
			input.organizationId,
			input.userId,
			WELCOME_CREDITS,
			"Welcome credits",
			{ idempotencyKey: `welcome12:${input.userId}` },
		);

		await db
			.update(schema.user)
			.set({ welcomeVoucherRedeemed: true })
			.where(eq(schema.user.id, input.userId));

		log.info("[Welcome] Granted welcome credits", {
			userId: redactId(input.userId),
			organizationId: redactId(input.organizationId),
			credits: WELCOME_CREDITS,
		});
		return true;
	} catch (error) {
		log.error("[Welcome] Failed to grant welcome credits", error, {
			userId: redactId(input.userId),
		});
		return false;
	}
}
