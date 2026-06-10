import { getAuth } from "./auth.server";
import {
	authApiUrl,
	internalAuthOrigin,
	readAuthHandlerJson,
	throwIfAuthHandlerFailed,
} from "./oauth-auth-http.server";
import {
	collectSetCookieHeaders,
	mergeSessionCookies,
} from "./oauth-query.server";
import { getAuthRedirectUrl } from "./oauth-redirect.server";

/**
 * Re-run OAuth authorize with an existing session so Better Auth returns a
 * fresh signed redirect (select-org or consent). Avoids stale oauth_query from
 * the initial login page URL after magic-link sign-in.
 */
export async function resumeOAuthAuthorizeAfterSession(
	env: Cloudflare.Env,
	request: Request,
	signedQuery: string,
): Promise<string> {
	const auth = getAuth(env);
	const params = new URLSearchParams(signedQuery);
	const authorizeUrl = authApiUrl(
		request,
		`/oauth2/authorize?${params.toString()}`,
	);
	const authorizeRequest = new Request(authorizeUrl, {
		method: "GET",
		headers: {
			cookie: request.headers.get("cookie") ?? "",
			accept: "application/json",
		},
	});
	const response = await auth.handler(authorizeRequest);
	await throwIfAuthHandlerFailed(response);
	const payload = await readAuthHandlerJson<unknown>(response);
	const redirectUrl = getAuthRedirectUrl(payload);
	if (!redirectUrl) {
		throw new Error("Authorize resume did not return a redirect URL");
	}
	return redirectUrl;
}

export async function invokeOAuth2ContinuePostLogin(
	env: Cloudflare.Env,
	request: Request,
	oauthQuery: string,
	options?: { headers?: Headers },
): Promise<unknown> {
	const auth = getAuth(env);
	const headers = options?.headers ?? new Headers(request.headers);
	headers.set("content-type", "application/json");
	headers.set("accept", "application/json");
	headers.set("origin", internalAuthOrigin(request));

	const continueRequest = new Request(authApiUrl(request, "/oauth2/continue"), {
		method: "POST",
		headers,
		body: JSON.stringify({
			postLogin: true,
			oauth_query: oauthQuery,
		}),
	});
	const response = await auth.handler(continueRequest);
	await throwIfAuthHandlerFailed(response);
	return readAuthHandlerJson(response);
}

export async function invokeOAuth2Consent(
	env: Cloudflare.Env,
	request: Request,
	body: {
		accept: boolean;
		oauth_query: string;
		scope?: string;
	},
): Promise<unknown> {
	const auth = getAuth(env);
	const headers = new Headers(request.headers);
	headers.set("content-type", "application/json");
	headers.set("accept", "application/json");
	headers.set("origin", internalAuthOrigin(request));

	const consentRequest = new Request(authApiUrl(request, "/oauth2/consent"), {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
	const response = await auth.handler(consentRequest);
	await throwIfAuthHandlerFailed(response);
	return readAuthHandlerJson(response);
}

export type SetActiveOrganizationResult = {
	/** Cookie header for the next internal auth.handler call. */
	headers: Headers;
	/** Set-Cookie lines to forward to the browser on redirect. */
	setCookieHeaders: Headers;
};

export async function setActiveOrganizationViaHandler(
	env: Cloudflare.Env,
	request: Request,
	organizationId: string,
): Promise<SetActiveOrganizationResult> {
	const auth = getAuth(env);
	const setActiveRequest = new Request(
		authApiUrl(request, "/organization/set-active"),
		{
			method: "POST",
			headers: {
				cookie: request.headers.get("cookie") ?? "",
				origin: internalAuthOrigin(request),
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify({ organizationId }),
		},
	);
	const response = await auth.handler(setActiveRequest);
	await throwIfAuthHandlerFailed(response);
	return {
		headers: mergeSessionCookies(request, { headers: response.headers }),
		setCookieHeaders: collectSetCookieHeaders(response.headers),
	};
}
