import { getAuth } from "~/lib/auth.server";
import { createOAuthDiscoveryHandler } from "~/lib/oauth-discovery.server";

/** OIDC-compatible alias for OAuth authorization-server metadata. */
export async function loader({
	request,
	context,
}: {
	request: Request;
	context: { cloudflare: { env: Cloudflare.Env } };
}) {
	const auth = getAuth(context.cloudflare.env);
	const handler = createOAuthDiscoveryHandler(auth, context.cloudflare.env);
	return handler(request);
}
