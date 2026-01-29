import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Form, redirect, useNavigation } from "react-router";
import * as schema from "~/db/schema";
import { createAuth, requireAuth } from "~/lib/auth.server";
import type { Route } from "./+types/invitations.accept";

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const invitationId = url.searchParams.get("id");

	if (!invitationId) {
		return { error: "Missing invitation ID", invitationId: null };
	}

	return { invitationId, error: null };
}

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const formData = await request.formData();
	const invitationId = formData.get("invitationId") as string;

	if (!invitationId) return { error: "Invalid invitation" };

	const env = context.cloudflare.env;
	const db = drizzle(env.DB, { schema });

	// Fetch invitation with comprehensive validation
	const invite = await db.query.invitation.findFirst({
		where: (inv, { eq }) => eq(inv.id, invitationId),
	});

	if (!invite) return { error: "Invitation not found" };

	// SECURITY: Validate invitation status
	if (invite.status !== "pending") {
		return { error: "This invitation has already been used or canceled" };
	}

	// SECURITY: Validate expiration
	if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
		return { error: "This invitation has expired. Please request a new one." };
	}

	// SECURITY: Check if user is already a member
	const existingMember = await db.query.member.findFirst({
		where: (m, { and, eq }) =>
			and(eq(m.organizationId, invite.organizationId), eq(m.userId, user.id)),
	});

	if (existingMember) {
		return { error: "You are already a member of this group" };
	}

	// BUSINESS RULE: Check user's group limit (5 groups max)
	const userGroupCount = await db
		.select({ count: schema.member.id })
		.from(schema.member)
		.where(eq(schema.member.userId, user.id));

	if (userGroupCount.length >= 5) {
		return {
			error:
				"You have reached the maximum of 5 groups. Please leave a group before joining another.",
		};
	}

	const auth = createAuth(env);

	// Add member using Better Auth API
	await auth.api.addMember({
		body: {
			organizationId: invite.organizationId,
			userId: user.id,
			role: invite.role as "member" | "admin" | "owner",
		},
	});

	// Mark invitation as accepted (preventing reuse)
	await db
		.update(schema.invitation)
		.set({ status: "accepted" })
		.where(eq(schema.invitation.id, invitationId));

	// Redirect to dashboard (user can switch to new group manually)
	return redirect("/dashboard");
}

export default function InvitationAcceptPage({
	loaderData,
}: Route.ComponentProps) {
	const { invitationId, error } = loaderData;
	const navigation = useNavigation();
	const isJoining = navigation.state === "submitting";

	if (error) {
		return (
			<div className="min-h-screen bg-ceramic flex items-center justify-center p-4">
				<div className="max-w-md w-full bg-danger/10 rounded-xl p-8 text-center text-danger">
					<h1 className="font-bold text-xl mb-2">Error</h1>
					<p>{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-ceramic flex items-center justify-center p-4">
			<div className="max-w-md w-full glass-panel rounded-xl p-8 text-center">
				<div className="w-16 h-16 bg-hyper-green/20 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl">
					🚀
				</div>
				<h1 className="text-2xl font-bold text-carbon mb-2">
					Incoming Transmission
				</h1>
				<p className="text-muted mb-8">
					You have been invited to join a Ration supply group.
				</p>

				<Form method="post">
					<input type="hidden" name="invitationId" value={invitationId || ""} />
					<button
						type="submit"
						disabled={isJoining}
						className="w-full py-3 bg-hyper-green text-carbon font-bold rounded-lg shadow-glow hover:shadow-glow-lg transition-all disabled:opacity-50"
					>
						{isJoining ? "Joining..." : "Accept & Join"}
					</button>
				</Form>

				<p className="mt-6 text-xs text-muted">
					By joining, you will gain access to shared inventory and credits.
				</p>
			</div>
		</div>
	);
}
