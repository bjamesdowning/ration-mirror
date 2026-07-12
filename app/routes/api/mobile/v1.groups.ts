import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { checkOwnedGroupCapacity } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import {
	isOrganizationSlugTaken,
	resolveOrganizationCreateSlug,
} from "~/lib/group-create.server";
import { log } from "~/lib/logging.server";
import { requireMobileAuth } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MobileCreateGroupSchema } from "~/lib/schemas/mobile/groups";
import type { Route } from "./+types/v1.groups";

/** GET is not supported; this route is action-only (POST). */
export async function loader() {
	throw data(
		{ error: "Method not allowed. Use POST to create a group." },
		{ status: 405 },
	);
}

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId } = await requireMobileAuth(context, request);
		const env = context.cloudflare.env;

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"group_create",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many group creation requests. Please try again later.",
				{ includeBodyMetadata: true },
			);
		}

		const body = await request.json();
		const parsed = MobileCreateGroupSchema.safeParse(body);
		if (!parsed.success) {
			return handleApiError(parsed.error);
		}

		const { name, slug: explicitSlug } = parsed.data;
		const db = drizzle(env.DB, { schema });

		const groupCapacity = await checkOwnedGroupCapacity(env, userId);
		if (!groupCapacity.allowed) {
			throw data(
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

		const slug = await resolveOrganizationCreateSlug(
			env.DB,
			name,
			explicitSlug,
		);
		if (explicitSlug && (await isOrganizationSlugTaken(env.DB, slug))) {
			throw data(
				{ error: "Unique ID is already taken. Please choose another." },
				{ status: 400 },
			);
		}

		const organizationId = crypto.randomUUID();

		try {
			await db.batch([
				db.insert(schema.organization).values({
					id: organizationId,
					name,
					slug,
					credits: 0,
					createdAt: new Date(),
					metadata: {},
				}),
				db.insert(schema.member).values({
					id: crypto.randomUUID(),
					organizationId,
					userId,
					role: "owner",
					createdAt: new Date(),
				}),
			]);
		} catch (e) {
			log.error("Group creation failed", e);
			throw data(
				{ error: "Failed to create group. Please try again." },
				{ status: 500 },
			);
		}

		return { success: true, organizationId };
	} catch (error) {
		return handleApiError(error);
	}
}
