import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { evaluateAdminAccountDelete } from "~/lib/admin-account-delete";
import { log, redactId } from "~/lib/logging.server";
import {
	checkRateLimit,
	type RateLimitResult,
} from "~/lib/rate-limiter.server";
import { beginAdminAccountPurge } from "~/lib/user-purge.server";

export type AdminDeleteAccountResult =
	| { kind: "accepted"; jobId: string }
	| { kind: "denied"; status: 400 | 404; error: string }
	| { kind: "rate_limited"; result: RateLimitResult };

export async function handleAdminDeleteAccount(input: {
	env: Cloudflare.Env;
	ctx: { waitUntil: (promise: Promise<unknown>) => void };
	adminUserId: string;
	userId: string;
	confirmEmail: string;
}): Promise<AdminDeleteAccountResult> {
	const rateLimitResult = await checkRateLimit(
		input.env.RATION_KV,
		"admin_account_purge",
		input.adminUserId,
	);
	if (!rateLimitResult.allowed) {
		return { kind: "rate_limited", result: rateLimitResult };
	}

	const db = drizzle(input.env.DB, { schema });
	const [target] = await db
		.select({
			id: schema.user.id,
			email: schema.user.email,
			isAdmin: schema.user.isAdmin,
			stripeCustomerId: schema.user.stripeCustomerId,
		})
		.from(schema.user)
		.where(eq(schema.user.id, input.userId))
		.limit(1);

	const decision = evaluateAdminAccountDelete({
		adminUserId: input.adminUserId,
		target: target ?? null,
		confirmEmail: input.confirmEmail,
	});
	if (!decision.ok) {
		return {
			kind: "denied",
			status: decision.status,
			error: decision.error,
		};
	}

	const { jobId } = await beginAdminAccountPurge(input.env, input.ctx, {
		userId: decision.target.id,
		email: decision.target.email,
		stripeCustomerId: decision.target.stripeCustomerId,
	});

	log.info("[Admin] Accepted account purge", {
		event: "admin_account_purge",
		adminUserId: redactId(input.adminUserId),
		userId: redactId(decision.target.id),
		jobId: redactId(jobId),
	});

	return { kind: "accepted", jobId };
}
