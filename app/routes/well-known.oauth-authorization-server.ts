import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { getAuth } from "~/lib/auth.server";

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET",
	"Cache-Control": "public, max-age=3600",
};

export async function loader({
	request,
	context,
}: {
	request: Request;
	context: { cloudflare: { env: Cloudflare.Env } };
}) {
	const auth = getAuth(context.cloudflare.env);
	const handler = oauthProviderAuthServerMetadata(auth, {
		headers: CORS_HEADERS,
	});
	return handler(request);
}
