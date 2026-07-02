import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import type { Route } from "./+types/v1.groups.members";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { organizationId } = await requireMobileActiveGroup(context, request);
		const db = drizzle(context.cloudflare.env.DB, { schema });

		const members = await db.query.member.findMany({
			where: (member, { eq }) => eq(member.organizationId, organizationId),
			with: {
				user: {
					columns: {
						name: true,
						email: true,
						image: true,
					},
				},
			},
		});

		return {
			members: members.map((member) => ({
				id: member.id,
				role: member.role,
				user: {
					name: member.user.name,
					email: member.user.email,
					image: member.user.image,
				},
			})),
		};
	} catch (error) {
		return handleApiError(error);
	}
}

/** POST is not supported; this route is loader-only (GET). */
export async function action() {
	throw data({ error: "Method not allowed" }, { status: 405 });
}
