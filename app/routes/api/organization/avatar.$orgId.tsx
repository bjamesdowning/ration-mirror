import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
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
	const { user } = await requireAuth(context, request);
	const db = drizzle(context.cloudflare.env.DB, { schema });

	// Verify user is a member of the organization (can view group logo)
	const membership = await db.query.member.findFirst({
		where: (m, { and, eq }) =>
			and(eq(m.organizationId, orgId), eq(m.userId, user.id)),
	});

	if (!membership) {
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
