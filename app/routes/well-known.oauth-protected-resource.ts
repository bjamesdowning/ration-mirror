import { buildProtectedResourceMetadata } from "~/lib/agent-readiness";

export async function loader({
	request,
	context,
}: {
	request: Request;
	context: { cloudflare: { env: Cloudflare.Env } };
}) {
	return Response.json(
		buildProtectedResourceMetadata(request, context.cloudflare.env),
		{
			headers: {
				"Cache-Control": "public, max-age=3600",
				"Access-Control-Allow-Origin": "*",
			},
		},
	);
}
