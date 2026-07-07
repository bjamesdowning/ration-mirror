import { rateLimitResponse } from "~/lib/rate-limiter.server";
import { assertAppleWebLoginAllowed } from "../lib/apple-web-login.server";
import { getAuth } from "../lib/auth.server";
import { buildFlagContext } from "../lib/feature-flags/flags.server";
import { withDefaultMcpResourceOnTokenExchange } from "../lib/oauth-auth-prepare.server";
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
		throw rateLimitResponse(rateLimitResult, "Too many requests");
	}
}

async function prepareAuthHandlerRequest(
	request: Request,
	env: Cloudflare.Env,
): Promise<Request> {
	let prepared = stripOrgSelectedForAuthorize(request);
	prepared = await withDefaultMcpResourceOnTokenExchange(prepared, env);
	return prepared;
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

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await enforceAuthRateLimit(request, env);
	const auth = getAuth(env);
	const session = await auth.api.getSession({ headers: request.headers });
	const flagContext = buildFlagContext(request, env, session);
	await assertAppleWebLoginAllowed(env, request, flagContext);
	return auth.handler(await prepareAuthHandlerRequest(request, env));
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;
	await enforceAuthRateLimit(request, env);
	const auth = getAuth(env);
	const session = await auth.api.getSession({ headers: request.headers });
	const flagContext = buildFlagContext(request, env, session);
	await assertAppleWebLoginAllowed(env, request, flagContext);
	return auth.handler(await prepareAuthHandlerRequest(request, env));
}
