import { z } from "zod";
import type { Route } from "./+types/avatar.$userId";

const paramsSchema = z.object({
	userId: z.string().uuid(),
});

export async function loader({ params, context }: Route.LoaderArgs) {
	const parsed = paramsSchema.safeParse({ userId: params.userId });
	if (!parsed.success) {
		return new Response("Not found", { status: 404 });
	}

	const avatarKey = `users/${parsed.data.userId}/avatar`;
	let object = await context.cloudflare.env.STORAGE.get(avatarKey);
	if (!object) {
		// Backward compatibility for older keys before deterministic avatar key.
		const legacyList = await context.cloudflare.env.STORAGE.list({
			prefix: `users/${parsed.data.userId}/avatar.`,
			limit: 1,
		});
		const legacyKey = legacyList.objects[0]?.key;
		if (legacyKey) {
			object = await context.cloudflare.env.STORAGE.get(legacyKey);
		}
	}
	if (!object) {
		return new Response("Not found", { status: 404 });
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("Cache-Control", "public, max-age=86400");
	headers.set("ETag", object.httpEtag);

	return new Response(object.body, { headers });
}
