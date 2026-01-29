import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { useEffect, useState } from "react";
import { Form, redirect, useFetcher, useNavigation } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";
import { data } from "~/lib/response";
import { DashboardHeader } from "../../components/dashboard/DashboardHeader";
import * as schema from "../../db/schema";
import type { UserSettings } from "../../lib/types";
import type { Route } from "./+types/settings";

export async function loader(args: Route.LoaderArgs) {
	try {
		const {
			session: { user: authUser },
			groupId,
		} = await requireActiveGroup(args.context, args.request);
		const userId = authUser.id;

		const env = args.context.cloudflare.env;
		const db = drizzle(env.DB, { schema });

		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, userId),
			with: { sessions: true },
		});

		if (!user) throw redirect("/sign-in");

		// Drizzle automatically parses JSON mode fields
		const settings = (user.settings as UserSettings) || {};

		// Fetch members
		const members = await db.query.member.findMany({
			where: (member, { eq }) => eq(member.organizationId, groupId),
			with: {
				user: true,
				organization: true, // Fetch organization name
			},
		});

		// Check if current user is owner
		const currentMember = members.find((m) => m.userId === userId);
		const isOwner = currentMember?.role === "owner";
		const currentOrg = members[0]?.organization;

		return {
			settings,
			members,
			isOwner,
			organizationId: groupId,
			organizationName: currentOrg?.name || "Unknown Group",
		};
	} catch (error) {
		console.error("[Settings] Loader failed:", error);
		if (error instanceof Response) throw error;
		throw data({ error: "Failed to load settings" }, { status: 500 });
	}
}

export async function action(args: Route.ActionArgs) {
	const {
		session: { user: authUser },
	} = await requireActiveGroup(args.context, args.request);
	const userId = authUser.id;

	const formData = await args.request.formData();
	const intent = formData.get("intent");

	const env = args.context.cloudflare.env;
	const db = drizzle(env.DB, { schema });

	if (intent === "update-units") {
		const unitSystem = formData.get("unitSystem"); // "metric" | "imperial"

		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, userId),
		});

		if (user) {
			const currentSettings = (user.settings as UserSettings) || {};
			const newSettings: UserSettings = {
				...currentSettings,
				unitSystem: unitSystem as "metric" | "imperial",
			};

			await db
				.update(schema.user)
				.set({ settings: newSettings })
				.where(eq(schema.user.id, userId));
		}

		return { success: true };
	}

	if (intent === "update-expiration-alert") {
		const days = Number(formData.get("expirationAlertDays")) || 7;
		const clampedDays = Math.min(Math.max(days, 1), 30); // Clamp between 1-30

		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, userId),
		});

		if (user) {
			const currentSettings = (user.settings as UserSettings) || {};
			const newSettings: UserSettings = {
				...currentSettings,
				expirationAlertDays: clampedDays,
			};

			await db
				.update(schema.user)
				.set({ settings: newSettings })
				.where(eq(schema.user.id, userId));
		}

		return { success: true };
	}

	if (intent === "update-list-generation") {
		const frequency = formData.get("frequency") as
			| "off"
			| "daily"
			| "weekly"
			| "custom";
		const intervalDays = Number(formData.get("intervalDays")) || 7;

		const user = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.id, userId),
		});

		if (user) {
			const currentSettings = (user.settings as UserSettings) || {};
			const newSettings: UserSettings = {
				...currentSettings,
				listGeneration: {
					...currentSettings.listGeneration,
					frequency,
					intervalDays: frequency === "custom" ? intervalDays : undefined,
					lastGeneratedAt: currentSettings.listGeneration?.lastGeneratedAt,
				},
			};

			await db
				.update(schema.user)
				.set({ settings: newSettings })
				.where(eq(schema.user.id, userId));
		}
		return { success: true };
	}

	return null;
}

export default function Settings({ loaderData }: Route.ComponentProps) {
	const { settings, members, isOwner, organizationId } = loaderData;
	const navigation = useNavigation();
	const isUpdatingUnits =
		navigation.state === "submitting" &&
		navigation.formData?.get("intent") === "update-units";
	const isUpdatingExpiration =
		navigation.state === "submitting" &&
		navigation.formData?.get("intent") === "update-expiration-alert";
	const isPurging =
		navigation.state === "submitting" &&
		navigation.formAction === "/api/user/purge";
	const isDeletingGroup =
		navigation.state === "submitting" &&
		navigation.formAction === "/api/groups/delete";
	const isUpdatingAutomation =
		navigation.state === "submitting" &&
		navigation.formData?.get("intent") === "update-list-generation";

	return (
		<div className="space-y-8 pb-20">
			<DashboardHeader title="Configuration" subtitle="System Preferences" />

			<div className="space-y-8">
				{/* Group Management */}
				<GroupManagement members={members} />

				{/* Unit System */}
				<section className="glass-panel rounded-xl p-6">
					<h2 className="text-xl font-bold mb-4 text-carbon">
						Measurement Standard
					</h2>
					<Form method="post" className="flex gap-4 flex-wrap">
						<input type="hidden" name="intent" value="update-units" />

						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="unitSystem"
								value="metric"
								defaultChecked={settings.unitSystem !== "imperial"}
								className="w-4 h-4 accent-hyper-green"
								onChange={(e) => e.target.form?.requestSubmit()}
							/>
							<span className="text-carbon">Metric (g, kg, ml)</span>
						</label>

						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="unitSystem"
								value="imperial"
								defaultChecked={settings.unitSystem === "imperial"}
								className="w-4 h-4 accent-hyper-green"
								onChange={(e) => e.target.form?.requestSubmit()}
							/>
							<span className="text-carbon">Imperial (oz, lb, fl oz)</span>
						</label>

						{isUpdatingUnits && (
							<span className="text-hyper-green animate-pulse text-sm ml-4 my-auto">
								Saving...
							</span>
						)}
					</Form>
				</section>

				{/* Expiration Alert */}
				<section className="glass-panel rounded-xl p-6">
					<h2 className="text-xl font-bold mb-2 text-carbon">
						Expiration Alerts
					</h2>
					<p className="text-sm text-muted mb-4">
						Get alerts for items expiring within this many days
					</p>
					<Form method="post" className="flex items-center gap-4">
						<input
							type="hidden"
							name="intent"
							value="update-expiration-alert"
						/>
						<input
							type="range"
							name="expirationAlertDays"
							min="1"
							max="30"
							defaultValue={settings.expirationAlertDays || 7}
							onChange={(e) => {
								const display = e.target.nextElementSibling;
								if (display) display.textContent = `${e.target.value} days`;
							}}
							onMouseUp={(e) => e.currentTarget.form?.requestSubmit()}
							onTouchEnd={(e) => e.currentTarget.form?.requestSubmit()}
							className="flex-1 h-2 bg-platinum rounded-lg appearance-none cursor-pointer accent-hyper-green"
						/>
						<span className="text-carbon font-bold min-w-[60px] text-right">
							{settings.expirationAlertDays || 7} days
						</span>
						{isUpdatingExpiration && (
							<span className="text-hyper-green animate-pulse text-sm">
								Saving...
							</span>
						)}
					</Form>
				</section>

				{/* Automated Restock */}
				<section className="glass-panel rounded-xl p-6">
					<div className="flex justify-between items-start mb-4">
						<div>
							<h2 className="text-xl font-bold text-carbon">
								Automated Restock
							</h2>
							<p className="text-sm text-muted">
								Auto-generate lists based on your supply levels
							</p>
						</div>
					</div>

					<Form method="post" className="space-y-4">
						<input type="hidden" name="intent" value="update-list-generation" />

						<div className="flex gap-2 p-1 bg-platinum/50 rounded-lg w-fit">
							{(["off", "daily", "weekly"] as const).map((freq) => (
								<label
									key={freq}
									className={`px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-all ${
										settings.listGeneration?.frequency === freq ||
										(!settings.listGeneration?.frequency && freq === "off")
											? "bg-white text-carbon shadow-sm"
											: "text-muted hover:text-carbon"
									}`}
								>
									<input
										type="radio"
										name="frequency"
										value={freq}
										defaultChecked={settings.listGeneration?.frequency === freq}
										className="hidden"
										onChange={(e) => e.target.form?.requestSubmit()}
									/>
									{freq.charAt(0).toUpperCase() + freq.slice(1)}
								</label>
							))}
						</div>

						{isUpdatingAutomation && (
							<span className="text-hyper-green animate-pulse text-sm">
								Saving...
							</span>
						)}
					</Form>
				</section>

				{/* Danger Zone */}
				<section className="bg-danger/5 border border-danger/20 rounded-xl p-6 relative">
					<div className="absolute top-4 right-4 bg-danger/20 px-2 py-1 text-xs text-danger rounded-md font-semibold">
						Danger Zone
					</div>

					<h2 className="text-xl font-bold mb-2 text-danger">Delete Account</h2>
					<p className="text-sm text-muted mb-6 max-w-md">
						Complete removal of your account and data. This action deletes all
						inventory, ledger history, and user records. This cannot be undone.
					</p>

					<Form
						action="/api/user/purge"
						method="post"
						onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
							if (
								!confirm(
									"Are you sure you want to delete your account? This cannot be undone.",
								)
							) {
								e.preventDefault();
							}
						}}
					>
						<button
							type="submit"
							disabled={isPurging}
							className="px-4 py-2 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-50"
						>
							{isPurging ? "Deleting..." : "Delete Account"}
						</button>
					</Form>

					{isOwner && (
						<div className="mt-8 pt-8 border-t border-danger/20">
							<h2 className="text-xl font-bold mb-2 text-danger">
								Delete Group
							</h2>
							<p className="text-sm text-muted mb-6 max-w-md">
								Permanently delete this group and all its data (inventory,
								meals, lists). This cannot be undone.
							</p>

							<Form
								action="/api/groups/delete"
								method="post"
								onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
									if (
										!confirm(
											"Are you sure you want to delete this group? All shared data will be lost forever.",
										)
									) {
										e.preventDefault();
									}
								}}
							>
								<input
									type="hidden"
									name="organizationId"
									value={organizationId}
								/>
								<button
									type="submit"
									disabled={isDeletingGroup}
									className="px-4 py-2 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-50"
								>
									{isDeletingGroup ? "Deleting..." : "Delete Group"}
								</button>
							</Form>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}

// biome-ignore lint/suspicious/noExplicitAny: members type is complex from query
function GroupManagement({ members }: { members: any[] }) {
	const session = authClient.useSession();
	const activeOrgId = session.data?.session.activeOrganizationId;
	const [inviteLink, setInviteLink] = useState<string | null>(null);
	const fetcher = useFetcher<{ success: boolean; invitationId: string }>();

	const handleInvite = () => {
		fetcher.submit(
			{},
			{ method: "post", action: "/api/groups/invitations/create" },
		);
	};

	useEffect(() => {
		if (fetcher.data?.success && fetcher.data?.invitationId) {
			setInviteLink(
				`${window.location.origin}/invitations/accept?id=${fetcher.data.invitationId}`,
			);
		}
	}, [fetcher.data]);

	if (!activeOrgId) return null;

	return (
		<section className="glass-panel rounded-xl p-6">
			<div className="flex justify-between items-start mb-6">
				<div>
					<h2 className="text-xl font-bold text-carbon">Group Members</h2>
					<p className="text-sm text-muted">
						Manage who has access to this pantry
					</p>
				</div>
				<button
					type="button"
					onClick={handleInvite}
					disabled={fetcher.state !== "idle"}
					className="px-4 py-2 bg-platinum text-carbon font-medium rounded-lg hover:bg-platinum/80 transition-colors text-sm disabled:opacity-50"
				>
					{fetcher.state === "submitting" ? "Creating..." : "Invite Member"}
				</button>
			</div>

			{inviteLink && (
				<div className="mb-6 p-4 bg-hyper-green/10 border border-hyper-green/20 rounded-lg">
					<p className="text-xs text-muted font-bold uppercase mb-2">
						Share this link
					</p>
					<div className="flex gap-2">
						<input
							type="text"
							readOnly
							value={inviteLink}
							className="flex-1 bg-white/50 border border-carbon/10 rounded px-3 py-1 text-sm font-mono text-carbon"
							onClick={(e) => e.currentTarget.select()}
						/>
						<button
							type="button"
							onClick={() => {
								navigator.clipboard.writeText(inviteLink);
								alert("Copied to clipboard!");
							}}
							className="px-3 py-1 bg-white text-carbon text-xs font-semibold rounded border border-carbon/10 hover:bg-gray-50"
						>
							Copy
						</button>
					</div>
				</div>
			)}

			<div className="space-y-3">
				{members?.map((member) => (
					<div
						key={member.id}
						className="flex items-center justify-between p-3 bg-platinum/30 rounded-lg"
					>
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 rounded-full bg-hyper-green/20 flex items-center justify-center text-hyper-green font-bold text-xs">
								{member.user.name?.charAt(0).toUpperCase()}
							</div>
							<div>
								<div className="text-sm font-medium text-carbon">
									{member.user.name}
								</div>
								<div className="text-xs text-muted capitalize">
									{member.role}
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
