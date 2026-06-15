import { buildAuthMarkdown } from "~/lib/agent-readiness";

export async function loader({
	request,
	context,
}: {
	request: Request;
	context: { cloudflare: { env: Cloudflare.Env } };
}) {
	const markdown = buildAuthMarkdown(request, context.cloudflare.env);
	return new Response(markdown, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
			"Access-Control-Allow-Origin": "*",
			Link: '</.well-known/oauth-authorization-server>; rel="oauth-authorization-server"',
		},
	});
}
