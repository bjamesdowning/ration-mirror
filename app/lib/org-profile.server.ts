import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import {
	canManageGroupSupplySettings,
	getMemberRole,
} from "~/lib/org-supply-settings.server";
import { OrganizationProfilePatchSchema } from "~/lib/schemas/org-profile";

export function canManageGroupProfile(role: string): boolean {
	return canManageGroupSupplySettings(role);
}

export type OrganizationProfileSnapshot = {
	id: string;
	name: string;
	slug: string | null;
	logo: string | null;
	credits: number;
};

export async function patchOrganizationProfile(
	db: D1Database,
	organizationId: string,
	userId: string,
	patch: { name: string },
): Promise<OrganizationProfileSnapshot> {
	const role = await getMemberRole(db, organizationId, userId);
	if (!role || !canManageGroupProfile(role)) {
		throw new Response(JSON.stringify({ error: "Forbidden" }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		});
	}

	const parsed = OrganizationProfilePatchSchema.parse(patch);
	const d1 = drizzle(db, { schema });

	await d1
		.update(schema.organization)
		.set({ name: parsed.name })
		.where(eq(schema.organization.id, organizationId));

	const [row] = await d1
		.select({
			id: schema.organization.id,
			name: schema.organization.name,
			slug: schema.organization.slug,
			logo: schema.organization.logo,
			credits: schema.organization.credits,
		})
		.from(schema.organization)
		.where(eq(schema.organization.id, organizationId))
		.limit(1);

	if (!row) {
		throw new Response(JSON.stringify({ error: "Organization not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	return row;
}
