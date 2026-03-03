import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { InterestSignupSchema } from "~/lib/schemas/interest";
import type { Route } from "./+types/interest";

function getClientIp(request: Request) {
	return (
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
		"unknown"
	);
}

/** GET not supported; POST only. */
export async function loader() {
	throw data(
		{ error: "Method not allowed. Use POST to submit your email." },
		{ status: 405 },
	);
}

/**
 * POST /api/interest - Pre-launch email signup (public, rate limited by IP)
 */
export async function action({ request, context }: Route.ActionArgs) {
	const clientIp = getClientIp(request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"interest_signup",
		clientIp,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests" },
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	try {
		if (request.method !== "POST") {
			throw data({ error: "Method not allowed" }, { status: 405 });
		}

		const json = await request.json();
		const input = InterestSignupSchema.parse(json);

		const db = drizzle(context.cloudflare.env.DB, { schema });

		const existing = await db.query.interestSignup.findFirst({
			where: eq(schema.interestSignup.email, input.email),
			columns: { id: true },
		});

		if (existing) {
			return data({ ok: true, alreadyRegistered: true }, { status: 200 });
		}

		await db.insert(schema.interestSignup).values({
			email: input.email,
			source: input.source ?? "home",
		});

		return data({ ok: true }, { status: 200 });
	} catch (e) {
		return handleApiError(e);
	}
}
