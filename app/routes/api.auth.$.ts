import { createAuth } from "../lib/auth.server";
import { checkRateLimit } from "../lib/rate-limiter.server";
import type { Route } from "./+types/api.auth.$";

function getClientIp(request: Request) {
	return (
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
		"unknown"
	);
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"auth_public",
		getClientIp(request),
	);
	if (!rateLimitResult.allowed) {
		return new Response("Too many requests", {
			status: 429,
			headers: {
				"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
				"X-RateLimit-Remaining": "0",
				"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
			},
		});
	}

	const auth = createAuth(context.cloudflare.env);
	return auth.handler(request);
}

export async function action({ request, context }: Route.ActionArgs) {
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"auth_public",
		getClientIp(request),
	);
	if (!rateLimitResult.allowed) {
		return new Response("Too many requests", {
			status: 429,
			headers: {
				"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
				"X-RateLimit-Remaining": "0",
				"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
			},
		});
	}

	const auth = createAuth(context.cloudflare.env);
	return auth.handler(request);
}
