import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { resolveGroupSlugFromName } from "~/lib/slugify";

export async function resolveOrganizationCreateSlug(
	db: D1Database,
	name: string,
	explicitSlug?: string,
): Promise<string> {
	if (explicitSlug) {
		return explicitSlug;
	}

	const d1 = drizzle(db, { schema });
	return resolveGroupSlugFromName(name, async (slug) => {
		const existing = await d1.query.organization.findFirst({
			where: (org, { eq: eqFn }) => eqFn(org.slug, slug),
			columns: { id: true },
		});
		return Boolean(existing);
	});
}

export async function isOrganizationSlugTaken(
	db: D1Database,
	slug: string,
): Promise<boolean> {
	const d1 = drizzle(db, { schema });
	const existing = await d1.query.organization.findFirst({
		where: eq(schema.organization.slug, slug),
		columns: { id: true },
	});
	return Boolean(existing);
}
