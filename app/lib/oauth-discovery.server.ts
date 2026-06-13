import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import type { Auth } from "./auth.server";

export const OAUTH_DISCOVERY_CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET",
	"Cache-Control": "public, max-age=3600",
} as const;

/** Shared OAuth/OIDC authorization-server metadata for well-known routes. */
export function createOAuthDiscoveryHandler(auth: Auth) {
	return oauthProviderAuthServerMetadata(auth, {
		headers: OAUTH_DISCOVERY_CORS_HEADERS,
	});
}
