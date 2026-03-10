import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { z } from "zod";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/avatar";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
const LOGO_KEY_PREFIX = "logo";

const avatarInputSchema = z.object({
	avatar: z.instanceof(File),
});

async function deleteExistingLogos(bucket: R2Bucket, orgId: string) {
	let cursor: string | undefined;
	const prefix = `organizations/${orgId}/${LOGO_KEY_PREFIX}`;

	do {
		const list = await bucket.list({ prefix, cursor });
		if (list.objects.length > 0) {
			await bucket.delete(list.objects.map((obj) => obj.key));
		}
		cursor = list.truncated ? list.cursor : undefined;
	} while (cursor);
}

export async function action({ request, context }: Route.ActionArgs) {
	const { session, groupId } = await requireActiveGroup(context, request);
	const userId = session.user.id;

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"org_avatar_upload",
		userId,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many group image upload requests. Please try again later.",
			},
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	const db = drizzle(context.cloudflare.env.DB, { schema });

	// SECURITY: Verify user has permission (owner or admin only)
	const membership = await db.query.member.findFirst({
		where: (m, { and, eq }) =>
			and(eq(m.organizationId, groupId), eq(m.userId, userId)),
	});

	if (!membership || !["owner", "admin"].includes(membership.role)) {
		throw data(
			{
				error: "Only group owners and admins can update the group image.",
			},
			{ status: 403 },
		);
	}

	try {
		const formData = await request.formData();
		const parsed = avatarInputSchema.safeParse({
			avatar: formData.get("avatar"),
		});

		if (!parsed.success) {
			throw data({ error: "No image file provided" }, { status: 400 });
		}

		const logoFile = parsed.data.avatar;
		if (logoFile.size > MAX_LOGO_BYTES) {
			throw data({ error: "Image too large (Max 2MB)" }, { status: 400 });
		}

		const mimeType = logoFile.type as (typeof ALLOWED_MIME_TYPES)[number];
		if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
			throw data(
				{
					error: "Unsupported image format. Use JPEG, PNG, or WebP.",
				},
				{ status: 415 },
			);
		}

		const logoKey = `organizations/${groupId}/${LOGO_KEY_PREFIX}`;
		const logoBuffer = await logoFile.arrayBuffer();

		await deleteExistingLogos(context.cloudflare.env.STORAGE, groupId);
		await context.cloudflare.env.STORAGE.put(logoKey, logoBuffer, {
			httpMetadata: {
				contentType: mimeType,
			},
		});

		const logoUrl = `/api/organization/avatar/${groupId}?v=${Date.now()}`;

		await db
			.update(schema.organization)
			.set({ logo: logoUrl })
			.where(eq(schema.organization.id, groupId));

		return data({
			success: true,
			image: logoUrl,
		});
	} catch (error) {
		if (
			error instanceof Response ||
			(error &&
				typeof error === "object" &&
				"type" in error &&
				(error as { type: string }).type === "DataWithResponseInit")
		) {
			throw error;
		}
		throw handleApiError(error);
	}
}
