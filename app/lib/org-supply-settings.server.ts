import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { resolveSupplyManifestWindow } from "~/lib/manifest-dates";
import {
	type OrganizationSupplySettingsPatch,
	OrganizationSupplySettingsPatchSchema,
} from "~/lib/schemas/org-supply-settings";
import type {
	OrganizationMetadata,
	OrganizationSupplySettings,
} from "~/lib/types";

export type GroupMemberRole = "owner" | "admin" | "member";

export function canManageGroupSupplySettings(
	role: GroupMemberRole | string,
): boolean {
	return role === "owner" || role === "admin";
}

export async function getMemberRole(
	db: D1Database,
	organizationId: string,
	userId: string,
): Promise<GroupMemberRole | null> {
	const d1 = drizzle(db, { schema });
	const [row] = await d1
		.select({ role: schema.member.role })
		.from(schema.member)
		.where(
			and(
				eq(schema.member.organizationId, organizationId),
				eq(schema.member.userId, userId),
			),
		)
		.limit(1);

	if (!row) return null;
	return row.role as GroupMemberRole;
}

export async function getOrganizationMetadata(
	db: D1Database,
	organizationId: string,
): Promise<OrganizationMetadata | null> {
	const d1 = drizzle(db, { schema });
	const [row] = await d1
		.select({ metadata: schema.organization.metadata })
		.from(schema.organization)
		.where(eq(schema.organization.id, organizationId))
		.limit(1);

	return (row?.metadata as OrganizationMetadata | null) ?? null;
}

export function getOrganizationSupplySettings(
	metadata: OrganizationMetadata | null | undefined,
): OrganizationSupplySettings {
	return metadata?.supplySettings ?? {};
}

export async function patchOrganizationSupplySettings(
	db: D1Database,
	organizationId: string,
	userId: string,
	patch: OrganizationSupplySettingsPatch,
): Promise<{
	supplySettings: OrganizationSupplySettings;
	window: ReturnType<typeof resolveSupplyManifestWindow>;
}> {
	const role = await getMemberRole(db, organizationId, userId);
	if (!role || !canManageGroupSupplySettings(role)) {
		throw new Response(JSON.stringify({ error: "Forbidden" }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		});
	}

	const parsed = OrganizationSupplySettingsPatchSchema.parse(patch);
	const d1 = drizzle(db, { schema });
	const current = await getOrganizationMetadata(db, organizationId);
	const nextMetadata: OrganizationMetadata = {
		...(current ?? {}),
		supplySettings: {
			...(current?.supplySettings ?? {}),
			manifestHorizonDays: parsed.manifestHorizonDays,
		},
	};

	await d1
		.update(schema.organization)
		.set({ metadata: nextMetadata })
		.where(eq(schema.organization.id, organizationId));

	const supplySettings = nextMetadata.supplySettings ?? {};
	return {
		supplySettings,
		window: resolveSupplyManifestWindow(nextMetadata),
	};
}

export function resolveSupplyContext(
	metadata: OrganizationMetadata | null | undefined,
	today?: string,
) {
	const window = resolveSupplyManifestWindow(metadata, today);
	return {
		horizonDays: window.horizonDays,
		supplySettings: getOrganizationSupplySettings(metadata),
		window,
	};
}
