import { buildAppleAppSiteAssociation } from "~/lib/aasa";

export async function loader() {
	const body = buildAppleAppSiteAssociation();

	return Response.json(body, {
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
