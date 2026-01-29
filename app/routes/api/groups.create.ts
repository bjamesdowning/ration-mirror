import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { data } from "~/lib/response";

export async function action({ request, context }: ActionFunctionArgs) {
    const { user, session } = await requireAuth(context, request);

    const formData = await request.formData();
    const name = formData.get("name")?.toString();
    const slug = formData.get("slug")?.toString();

    if (!name || !slug) {
        throw data({ error: "Name and Slug are required" }, { status: 400 });
    }

    // Validate slug format (alphanumeric, hyphens)
    if (!/^[a-z0-9-]+$/.test(slug)) {
        throw data(
            {
                error:
                    "Unique ID must contain only lowercase letters, numbers, and hyphens",
            },
            { status: 400 },
        );
    }

    const db = drizzle(context.cloudflare.env.DB, { schema });

    // Check slug uniqueness
    const existing = await db.query.organization.findFirst({
        where: (org, { eq }) => eq(org.slug, slug),
    });

    if (existing) {
        throw data(
            { error: "Unique ID is already taken. Please choose another." },
            { status: 400 },
        );
    }

    const orgId = crypto.randomUUID();

    // Context switch requires the primary session ID, not the join table ID
    try {
        // Create organization, add member, and switch context in one transaction
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
        console.error("Group creation failed:", e);
        throw data(
            { error: "Failed to create group. Please try again." },
            { status: 500 },
        );
    }

    return redirect("/dashboard");
}
