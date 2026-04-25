import { buildOpenApiDocument } from "~/lib/agent-readiness";

export async function loader({ request }: { request: Request }) {
	return Response.json(buildOpenApiDocument(request), {
		headers: {
			"Content-Type": "application/vnd.oai.openapi+json; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
