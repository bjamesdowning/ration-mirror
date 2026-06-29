import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { z } from "zod";
import * as schema from "~/db/schema";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.organization.avatar";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
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

/** POST /api/mobile/v1/organization/avatar — org logo upload (owner/admin, Bearer auth). */
export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const { userId, organizationId } = await requireMobileActiveGroup(
		context,
		request,
	);

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
				},
			},
		);
	}

	const db = drizzle(context.cloudflare.env.DB, { schema });
	const membership = await db.query.member.findFirst({
		where: (m, { and, eq }) =>
			and(eq(m.organizationId, organizationId), eq(m.userId, userId)),
	});

	if (!membership || !["owner", "admin"].includes(membership.role)) {
		throw data(
			{ error: "Only group owners and admins can update the group image." },
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
				{ error: "Unsupported image format. Use JPEG, PNG, or WebP." },
				{ status: 415 },
			);
		}

		const logoKey = `organizations/${organizationId}/${LOGO_KEY_PREFIX}`;
		await deleteExistingLogos(context.cloudflare.env.STORAGE, organizationId);
		await context.cloudflare.env.STORAGE.put(
			logoKey,
			await logoFile.arrayBuffer(),
			{ httpMetadata: { contentType: mimeType } },
		);

		const logoUrl = `/api/organization/avatar/${organizationId}?v=${Date.now()}`;
		await db
			.update(schema.organization)
			.set({ logo: logoUrl })
			.where(eq(schema.organization.id, organizationId));

		return { success: true, logoUrl };
	} catch (e) {
		return handleApiError(e);
	}
}
