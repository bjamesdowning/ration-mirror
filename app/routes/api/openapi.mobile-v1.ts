import { buildMobileOpenApiDocument } from "~/lib/openapi-mobile-document.server";

export async function loader({ request }: { request: Request }) {
	const baseUrl = new URL(request.url).origin;
	return Response.json(buildMobileOpenApiDocument(baseUrl), {
		headers: {
			"Content-Type": "application/vnd.oai.openapi+json; charset=utf-8",
			"Cache-Control": "public, max-age=300",
		},
	});
}
