import { resolveMcpResourceAudience } from "./oauth.constants";

export function shouldDefaultMcpResource(grantType: string | null): boolean {
	return grantType === "authorization_code" || grantType === "refresh_token";
}

/**
 * Better Auth only issues JWT access tokens when RFC 8707 `resource` is present
 * on the token request. Default it for MCP code/refresh exchanges when omitted.
 */
export async function withDefaultMcpResourceOnTokenExchange(
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
