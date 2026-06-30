import { z } from "zod";
import { resolveOrgAvatarViewerUserId } from "~/lib/org-avatar-auth.server";
import type { Route } from "./+types/avatar.$orgId";

const paramsSchema = z.object({
	orgId: z
		.string()
		.min(1)
		.max(128)
		.regex(/^[A-Za-z0-9_-]+$/),
});

export async function loader({ params, context, request }: Route.LoaderArgs) {
	const parsed = paramsSchema.safeParse({ orgId: params.orgId });
	if (!parsed.success) {
		return new Response("Not found", { status: 404 });
	}

	const orgId = parsed.data.orgId;
	const userId = await resolveOrgAvatarViewerUserId(context, request, orgId);
	if (!userId) {
		return new Response("Not found", { status: 404 });
	}

	const logoKey = `organizations/${orgId}/logo`;
	const object = await context.cloudflare.env.STORAGE.get(logoKey);
	if (!object) {
		return new Response("Not found", { status: 404 });
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("Cache-Control", "private, max-age=86400");
	headers.set("ETag", object.httpEtag ?? "");

	return new Response(object.body, { headers });
}
