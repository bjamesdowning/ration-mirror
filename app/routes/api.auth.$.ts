import { data } from "react-router";
import { getAuth } from "../lib/auth.server";
import { resolveMcpResourceAudience } from "../lib/oauth.constants";
import { stripOAuthOrgSelectedFromCookieHeader } from "../lib/oauth-cookies.server";
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

function shouldDefaultMcpResource(grantType: string | null): boolean {
	return grantType === "authorization_code" || grantType === "refresh_token";
}

/**
 * Better Auth only issues JWT access tokens when RFC 8707 `resource` is present
 * on the token request. Default it for MCP code/refresh exchanges when omitted.
 */
async function withDefaultMcpResourceOnTokenExchange(
	request: Request,
	env: Cloudflare.Env,
): Promise<Request> {
	const url = new URL(request.url);
	if (request.method !== "POST" || !url.pathname.includes("/oauth2/token")) {
		return request;
	}

	const contentType = request.headers.get("content-type") ?? "";
	const headers = new Headers(request.headers);

	if (contentType.includes("application/json")) {
		const body = (await request.clone().json()) as Record<string, unknown>;
		const grantType =
			typeof body.grant_type === "string" ? body.grant_type : null;
		if (!body.resource && shouldDefaultMcpResource(grantType)) {
			body.resource = resolveMcpResourceAudience(env);
			return new Request(request.url, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			});
		}
		return request;
	}

	if (contentType.includes("application/x-www-form-urlencoded")) {
		const params = new URLSearchParams(await request.clone().text());
		const grantType = params.get("grant_type");
		if (!params.has("resource") && shouldDefaultMcpResource(grantType)) {
			params.set("resource", resolveMcpResourceAudience(env));
			headers.set("content-type", "application/x-www-form-urlencoded");
			return new Request(request.url, {
				method: "POST",
				headers,
				body: params.toString(),
			});
		}
	}

	return request;
}

/**
 * Fresh browser authorize requests must not reuse a prior org-selected cookie;
 * otherwise multi-household users skip household pick and may auto-complete via
 * stored consent (Cursor shows only the native app handoff dialog).
 */
function stripOrgSelectedForAuthorize(request: Request): Request {
	const url = new URL(request.url);
	if (request.method !== "GET" || !url.pathname.includes("/oauth2/authorize")) {
		return request;
	}

	const stripped = stripOAuthOrgSelectedFromCookieHeader(
		request.headers.get("cookie") ?? "",
	);
	const headers = new Headers(request.headers);
	if (stripped) {
		headers.set("cookie", stripped);
	} else {
		headers.delete("cookie");
	}
	return new Request(request, { headers });
}

async function prepareAuthHandlerRequest(
	request: Request,
	env: Cloudflare.Env,
): Promise<Request> {
	let prepared = stripOrgSelectedForAuthorize(request);
	prepared = await withDefaultMcpResourceOnTokenExchange(prepared, env);
	return prepared;
}

export async function loader({ request, context }: Route.LoaderArgs) {
	await enforceAuthRateLimit(request, context.cloudflare.env);
	const auth = getAuth(context.cloudflare.env);
	return auth.handler(
		await prepareAuthHandlerRequest(request, context.cloudflare.env),
	);
}

export async function action({ request, context }: Route.ActionArgs) {
	await enforceAuthRateLimit(request, context.cloudflare.env);
	const auth = getAuth(context.cloudflare.env);
	return auth.handler(
		await prepareAuthHandlerRequest(request, context.cloudflare.env),
	);
}
