export async function loader() {
	const body = {
		applinks: {
			apps: [],
			details: [
				{
					appID: "TEAMID.com.mayutic.ration",
					paths: ["/auth/mobile-callback", "/auth/mobile-callback/*"],
				},
			],
		},
	};

	return Response.json(body, {
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
