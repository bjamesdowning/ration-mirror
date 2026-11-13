import { buildSetupMarkdown } from "~/lib/agent-setup";

/** /setup.md — public imperative setup. No session. */
export async function loader({ request }: { request: Request }) {
	const markdown = buildSetupMarkdown(request);
	return new Response(markdown, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
			"Access-Control-Allow-Origin": "*",
		},
	});
}
