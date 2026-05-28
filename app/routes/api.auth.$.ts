import { data } from "react-router";
import { getAuth } from "../lib/auth.server";
import { checkRateLimit } from "../lib/rate-limiter.server";
import type { Route } from "./+types/api.auth.$";

function getClientIp(request: Request) {
	return (
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
		"unknown"
	);
}

function oauthRateLimitCategory(pathname: string): string | null {
	if (pathname.includes("/oauth2/authorize")) return "oauth_authorize";
	if (pathname.includes("/oauth2/token")) return "oauth_token";
	if (pathname.includes("/register")) return "oauth_register";
	if (pathname.includes("/oauth2/introspect")) return "oauth_introspect";
	if (pathname.includes("/oauth2/revoke")) return "oauth_revoke";
	return null;
}

async function enforceAuthRateLimit(
	request: Request,
	env: Cloudflare.Env,
): Promise<void> {
	const ip = getClientIp(request);
	const url = new URL(request.url);
	const oauthCategory = oauthRateLimitCategory(url.pathname);
	const category = oauthCategory ?? "auth_public";
	const rateLimitResult = await checkRateLimit(env.RATION_KV, category, ip);
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
}

export async function loader({ request, context }: Route.LoaderArgs) {
	await enforceAuthRateLimit(request, context.cloudflare.env);
	const auth = getAuth(context.cloudflare.env);
	return auth.handler(request);
}

export async function action({ request, context }: Route.ActionArgs) {
	await enforceAuthRateLimit(request, context.cloudflare.env);
	const auth = getAuth(context.cloudflare.env);
	return auth.handler(request);
}
