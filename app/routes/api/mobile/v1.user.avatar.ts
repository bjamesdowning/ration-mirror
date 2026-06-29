import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { z } from "zod";
import * as schema from "~/db/schema";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileAuth } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.user.avatar";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_KEY_SUFFIX = "avatar";

const avatarInputSchema = z.object({
	avatar: z.instanceof(File),
});

async function deleteExistingAvatars(bucket: R2Bucket, userId: string) {
	let cursor: string | undefined;
	const prefix = `users/${userId}/${AVATAR_KEY_SUFFIX}`;

	do {
		const list = await bucket.list({ prefix, cursor });
		if (list.objects.length > 0) {
			await bucket.delete(list.objects.map((obj) => obj.key));
		}
		cursor = list.truncated ? list.cursor : undefined;
	} while (cursor);
}

/** POST /api/mobile/v1/user/avatar — multipart avatar upload (Bearer auth). */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const { userId } = await requireMobileAuth(context, request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"avatar_upload",
		userId,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many avatar upload requests. Please try again later." },
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
				},
			},
		);
	}

	try {
		const formData = await request.formData();
		const parsed = avatarInputSchema.safeParse({
			avatar: formData.get("avatar"),
		});
		if (!parsed.success) {
			throw data({ error: "No avatar file provided" }, { status: 400 });
		}

		const avatarFile = parsed.data.avatar;
		if (avatarFile.size > MAX_AVATAR_BYTES) {
			throw data({ error: "Image too large (Max 2MB)" }, { status: 400 });
		}

		const mimeType = avatarFile.type as (typeof ALLOWED_MIME_TYPES)[number];
		if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
			throw data(
				{ error: "Unsupported image format. Use JPEG, PNG, or WebP." },
				{ status: 415 },
			);
		}

		const avatarKey = `users/${userId}/${AVATAR_KEY_SUFFIX}`;
		await deleteExistingAvatars(context.cloudflare.env.STORAGE, userId);
		await context.cloudflare.env.STORAGE.put(
			avatarKey,
			await avatarFile.arrayBuffer(),
			{ httpMetadata: { contentType: mimeType } },
		);

		const imageUrl = `/api/user/avatar/${userId}?v=${Date.now()}`;
		const db = drizzle(context.cloudflare.env.DB, { schema });
		await db
			.update(schema.user)
			.set({ image: imageUrl, updatedAt: new Date() })
			.where(eq(schema.user.id, userId));

		return { success: true, imageUrl };
	} catch (e) {
		return handleApiError(e);
	}
}
