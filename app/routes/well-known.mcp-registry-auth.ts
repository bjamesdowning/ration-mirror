import { getMcpRegistryAuthRecord } from "~/lib/mcp-registry-auth";

export async function loader({
	context,
}: {
	context: { cloudflare: { env: unknown } };
}) {
	const record = getMcpRegistryAuthRecord(
		context.cloudflare.env as Partial<Record<string, unknown>>,
	);
	if (!record) {
		return new Response("Not Found", {
			status: 404,
			headers: { "Cache-Control": "no-store" },
		});
	}
	return new Response(`${record}\n`, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=300",
		},
	});
}
