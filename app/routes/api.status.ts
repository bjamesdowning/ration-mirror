import { APP_VERSION } from "~/lib/version";

export async function loader() {
	return Response.json(
		{
			status: "ok",
			service: "ration",
			version: APP_VERSION,
		},
		{
			headers: {
				"Cache-Control": "public, max-age=60",
			},
		},
	);
}
