import {
	buildAgentSkillMarkdown,
	markdownResponse,
} from "~/lib/agent-readiness";

export async function loader({ params }: { params: { skillName?: string } }) {
	const markdown = buildAgentSkillMarkdown(params.skillName ?? "");
	if (!markdown) {
		return new Response("Not Found", { status: 404 });
	}
	return markdownResponse(markdown, {
		headers: {
			"Cache-Control": "public, max-age=3600",
			"Access-Control-Allow-Origin": "*",
		},
	});
}
