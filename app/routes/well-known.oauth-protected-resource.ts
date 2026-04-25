import { buildProtectedResourceMetadata } from "~/lib/agent-readiness";

export async function loader({ request }: { request: Request }) {
	return Response.json(buildProtectedResourceMetadata(request), {
		headers: {
			"Cache-Control": "public, max-age=3600",
			"Access-Control-Allow-Origin": "*",
		},
	});
}
