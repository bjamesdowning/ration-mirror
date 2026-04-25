import { buildApiCatalog } from "~/lib/agent-readiness";

export async function loader({ request }: { request: Request }) {
	return Response.json(buildApiCatalog(request), {
		headers: {
			"Content-Type": "application/linkset+json; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
