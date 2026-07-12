import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { checkOwnedGroupCapacity } from "~/lib/capacity.server";
import {
	isOrganizationSlugTaken,
	resolveOrganizationCreateSlug,
} from "~/lib/group-create.server";
import { log } from "~/lib/logging.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MobileCreateGroupSchema } from "~/lib/schemas/mobile/groups";
import type { Route } from "./+types/groups.create";

/** GET is not supported; this route is action-only (POST). */
export async function loader() {
	throw data(
		{ error: "Method not allowed. Use POST to create a group." },
		{ status: 405 },
	);
}

export async function action({ request, context }: Route.ActionArgs) {
	const { user, session } = await requireAuth(context, request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"group_create",
		user.id,
	);

	if (!rateLimitResult.allowed) {
		return rateLimitResponse(
			rateLimitResult,
			"Too many group creation requests. Please try again later.",
			{ includeBodyMetadata: true },
		);
	}

	const formData = await request.formData();
	const nameRaw = formData.get("name")?.toString();
	const slugRaw = formData.get("slug")?.toString();

	const parsed = MobileCreateGroupSchema.safeParse({
		name: nameRaw,
		slug: slugRaw?.trim() ? slugRaw : undefined,
	});
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0]?.message ?? "Invalid request";
		return data({ error: firstIssue }, { status: 400 });
	}

	const { name, slug: explicitSlug } = parsed.data;
	const db = drizzle(context.cloudflare.env.DB, { schema });

	const groupCapacity = await checkOwnedGroupCapacity(
		context.cloudflare.env,
		user.id,
	);
	if (!groupCapacity.allowed) {
		return data(
			{
				error: "capacity_exceeded",
				resource: "owned_groups",
				current: groupCapacity.current,
				limit: groupCapacity.limit,
				tier: groupCapacity.tier,
				canAdd: groupCapacity.canCreate,
				upgradePath: "crew_member",
			},
			{ status: 403 },
		);
	}

	let slug: string;
	try {
		slug = await resolveOrganizationCreateSlug(
			context.cloudflare.env.DB,
			name,
			explicitSlug,
		);
	} catch {
		return data(
			{ error: "Failed to create group. Please try again." },
			{
				status: 500,
			},
		);
	}

	if (
		explicitSlug &&
		(await isOrganizationSlugTaken(context.cloudflare.env.DB, slug))
	) {
		return data(
			{ error: "Unique ID is already taken. Please choose another." },
			{ status: 400 },
		);
	}

	const orgId = crypto.randomUUID();

	try {
		await db.batch([
			db.insert(schema.organization).values({
				id: orgId,
				name,
				slug,
				credits: 0,
				createdAt: new Date(),
				metadata: {},
			}),
			db.insert(schema.member).values({
				id: crypto.randomUUID(),
				organizationId: orgId,
				userId: user.id,
				role: "owner",
				createdAt: new Date(),
			}),
			db
				.update(schema.session)
				.set({ activeOrganizationId: orgId })
				.where(eq(schema.session.id, session.id)),
		]);
	} catch (e) {
		log.error("Group creation failed", e);
		return data(
			{ error: "Failed to create group. Please try again." },
			{ status: 500 },
		);
	}

	return data({ success: true }, { status: 200 });
}
