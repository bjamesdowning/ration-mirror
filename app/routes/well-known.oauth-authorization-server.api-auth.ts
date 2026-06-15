import { getAuth } from "~/lib/auth.server";
import { createOAuthDiscoveryHandler } from "~/lib/oauth-discovery.server";

/** Issuer-path variant for clients that append /api/auth to well-known paths. */
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
