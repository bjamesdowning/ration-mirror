import { buildAgentSkillsIndex } from "~/lib/agent-readiness";

export async function loader({ request }: { request: Request }) {
	return Response.json(await buildAgentSkillsIndex(request), {
		headers: {
			"Cache-Control": "public, max-age=3600",
			"Access-Control-Allow-Origin": "*",
		},
	});
}
