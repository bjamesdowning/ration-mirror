import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { buildAgentAuthMetadata } from "./agent-readiness";
import type { Auth } from "./auth.server";

export const OAUTH_DISCOVERY_CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET",
	"Cache-Control": "public, max-age=3600",
} as const;

/** Shared OAuth/OIDC authorization-server metadata for well-known routes. */
export function createOAuthDiscoveryHandler(auth: Auth, env: Cloudflare.Env) {
	const baseHandler = oauthProviderAuthServerMetadata(auth, {
		headers: OAUTH_DISCOVERY_CORS_HEADERS,
	});

	return async (request: Request) => {
		const res = await baseHandler(request);
		const meta = (await res.json()) as Record<string, unknown>;
		const agentAuth = buildAgentAuthMetadata(request, env);
		const headers = new Headers(res.headers);
		return Response.json({ ...meta, agent_auth: agentAuth }, { headers });
	};
}
