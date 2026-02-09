import { and, count, eq, gt, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { useCallback, useEffect, useState } from "react";
import { data, Link, useFetcher } from "react-router";
import { z } from "zod";

import * as schema from "../db/schema";
import { requireAdmin } from "../lib/auth.server";
import { handleApiError } from "../lib/error-handler";
import type { Route } from "./+types/admin";

const ToggleAdminSchema = z.object({
	intent: z.literal("toggle-admin"),
	userId: z.string().min(1),
});

export async function loader(args: Route.LoaderArgs) {
	// Verify Admin Access (this handles auth check too)
	const adminUser = await requireAdmin(args.context, args.request);

	const env = args.context.cloudflare.env;
	const db = drizzle(env.DB, { schema });
	const now = new Date();

	// --- Overview ---
	const userCount = await db.$count(schema.user);
	const inventoryCount = await db.$count(schema.inventory);
	const burnedResult = await db
		.select({
			burned: sql<number>`sum(case when ${schema.ledger.amount} < 0 then abs(${schema.ledger.amount}) else 0 end)`,
		})
		.from(schema.ledger)
		.get();

	// --- Maintenance: Active Users ---
	const activeUsersResult = await db
		.select({
			count: sql<number>`count(distinct ${schema.session.userId})`,
		})
		.from(schema.session)
		.where(gt(schema.session.expiresAt, now))
		.get();

	const activeSessionsResult = await db
		.select({ count: count() })
		.from(schema.session)
		.where(gt(schema.session.expiresAt, now))
		.get();

	const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
	const newSignups7dResult = await db
		.select({ count: count() })
		.from(schema.user)
		.where(gt(schema.user.createdAt, sevenDaysAgo))
		.get();
	const newSignups30dResult = await db
		.select({ count: count() })
		.from(schema.user)
		.where(gt(schema.user.createdAt, thirtyDaysAgo))
		.get();

	// --- Feature Usage ---
	const groupCount = await db.$count(schema.organization);
	const mealCount = await db.$count(schema.meal);
	const activeMealCount = await db.$count(schema.activeMealSelection);
	const groceryListCount = await db.$count(schema.groceryList);
	const scanCountResult = await db
		.select({ count: count() })
		.from(schema.ledger)
		.where(eq(schema.ledger.reason, "scan"))
		.get();

	// --- Platform Health ---
	const totalCreditsResult = await db
		.select({
			total: sql<number>`coalesce(sum(${schema.organization.credits}), 0)`,
		})
		.from(schema.organization)
		.get();

	const pendingInvitesResult = await db
		.select({ count: count() })
		.from(schema.invitation)
		.where(eq(schema.invitation.status, "pending"))
		.get();

	const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
	const expiringItemsResult = await db
		.select({ count: count() })
		.from(schema.inventory)
		.where(
			and(
				gt(schema.inventory.expiresAt, now),
				lt(schema.inventory.expiresAt, sevenDaysFromNow),
			),
		)
		.get();

	const verifiedUsersResult = await db
		.select({ count: count() })
		.from(schema.user)
		.where(eq(schema.user.emailVerified, true))
		.get();

	return {
		currentUserId: adminUser.id,
		userCount,
		inventoryCount,
		burnedCredits: burnedResult?.burned || 0,
		activeUsers: activeUsersResult?.count ?? 0,
		activeSessions: activeSessionsResult?.count ?? 0,
		newSignups7d: newSignups7dResult?.count ?? 0,
		newSignups30d: newSignups30dResult?.count ?? 0,
		groupCount,
		mealCount,
		activeMealCount,
		groceryListCount,
		scanCount: scanCountResult?.count ?? 0,
		totalCredits: totalCreditsResult?.total ?? 0,
		pendingInvites: pendingInvitesResult?.count ?? 0,
		expiringItems: expiringItemsResult?.count ?? 0,
		verifiedEmailRate:
			userCount > 0 ? ((verifiedUsersResult?.count ?? 0) / userCount) * 100 : 0,
	};
}

export async function action(args: Route.ActionArgs) {
	const adminUser = await requireAdmin(args.context, args.request);

	if (args.request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	try {
		const formData = await args.request.formData();
		const { userId } = ToggleAdminSchema.parse({
			intent: formData.get("intent"),
			userId: formData.get("userId"),
		});

		if (userId === adminUser.id) {
			return new Response(
				JSON.stringify({ error: "Cannot modify your own admin status" }),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			);
		}

		const db = drizzle(args.context.cloudflare.env.DB, { schema });
		const [existing] = await db
			.select({ isAdmin: schema.user.isAdmin })
			.from(schema.user)
			.where(eq(schema.user.id, userId))
			.limit(1);

		if (!existing) {
			return new Response(JSON.stringify({ error: "User not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		await db
			.update(schema.user)
			.set({ isAdmin: !existing.isAdmin, updatedAt: new Date() })
			.where(eq(schema.user.id, userId));

		return data({ success: true });
	} catch (e) {
		return handleApiError(e);
	}
}

function MetricCard({
	title,
	value,
	subtitle,
	iconPath,
}: {
	title: string;
	value: string | number;
	subtitle: string;
	iconPath: string;
}) {
	return (
		<div className="glass-panel rounded-2xl p-6 relative group">
			<div className="absolute top-4 right-4 opacity-30 group-hover:opacity-50 transition-opacity">
				<svg
					className="w-12 h-12 text-hyper-green"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					role="img"
					aria-label={title}
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={1.5}
						d={iconPath}
					/>
				</svg>
			</div>
			<h2 className="text-label text-muted mb-2">{title}</h2>
			<div className="text-display text-5xl text-carbon tabular-nums">
				{typeof value === "number" ? value.toLocaleString() : value}
			</div>
			<div className="mt-4 text-xs text-muted">{subtitle}</div>
		</div>
	);
}

type SearchUser = {
	id: string;
	name: string;
	email: string;
	isAdmin: boolean;
	createdAt: Date | null;
};

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
	const {
		currentUserId,
		userCount,
		inventoryCount,
		burnedCredits,
		activeUsers,
		activeSessions,
		newSignups7d,
		newSignups30d,
		groupCount,
		mealCount,
		activeMealCount,
		groceryListCount,
		scanCount,
		totalCredits,
		pendingInvites,
		expiringItems,
		verifiedEmailRate,
	} = loaderData;

	const searchFetcher = useFetcher<{ users: SearchUser[] }>();
	const toggleFetcher = useFetcher();
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQuery(searchQuery.trim());
		}, 300);
		return () => clearTimeout(timer);
	}, [searchQuery]);

	useEffect(() => {
		if (debouncedQuery.length >= 2) {
			searchFetcher.load(
				`/api/admin/users?q=${encodeURIComponent(debouncedQuery)}`,
			);
		}
	}, [debouncedQuery, searchFetcher.load]);

	const users = searchFetcher.data?.users ?? [];
	const isSearching = searchFetcher.state === "loading";

	const handleToggleClick = useCallback(
		(user: SearchUser) => {
			if (user.id === currentUserId) return;
			if (confirmingUserId === user.id) {
				toggleFetcher.submit(
					{ intent: "toggle-admin", userId: user.id },
					{ method: "POST" },
				);
				setConfirmingUserId(null);
			} else {
				setConfirmingUserId(user.id);
			}
		},
		[currentUserId, confirmingUserId, toggleFetcher],
	);

	const handleConfirmBlur = useCallback(() => {
		setTimeout(() => setConfirmingUserId(null), 150);
	}, []);

	useEffect(() => {
		if (
			toggleFetcher.state === "idle" &&
			(toggleFetcher.data as { success?: boolean } | undefined)?.success &&
			debouncedQuery.length >= 2
		) {
			searchFetcher.load(
				`/api/admin/users?q=${encodeURIComponent(debouncedQuery)}`,
			);
		}
	}, [
		toggleFetcher.state,
		toggleFetcher.data,
		debouncedQuery,
		searchFetcher.load,
	]);

	return (
		<div className="min-h-screen bg-ceramic text-carbon p-8">
			<header className="mb-12 border-b border-carbon/10 pb-4 flex justify-between items-center">
				<div>
					<h1 className="text-display text-3xl text-carbon">Admin Dashboard</h1>
					<p className="text-sm text-muted mt-1">System overview and metrics</p>
				</div>
				<div className="flex items-center gap-4">
					<Link
						to="/dashboard"
						className="inline-flex items-center gap-2 px-4 py-2 bg-platinum/50 text-carbon rounded-lg font-medium hover:bg-platinum transition-colors"
					>
						Back to Dashboard
					</Link>
					<span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success text-sm font-medium">
						<span className="w-2 h-2 rounded-full bg-success animate-pulse" />
						Online
					</span>
				</div>
			</header>

			<main className="space-y-12 max-w-6xl">
				{/* Overview */}
				<section>
					<h2 className="text-label text-muted text-sm font-medium uppercase tracking-wider mb-4">
						Overview
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<MetricCard
							title="Total Users"
							value={userCount}
							subtitle="Registered accounts"
							iconPath="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
						/>
						<MetricCard
							title="Items Tracked"
							value={inventoryCount}
							subtitle="Total inventory entries"
							iconPath="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
						/>
						<MetricCard
							title="Credits Used"
							value={burnedCredits}
							subtitle="Total credits consumed"
							iconPath="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</div>
				</section>

				{/* Maintenance */}
				<section>
					<h2 className="text-label text-muted text-sm font-medium uppercase tracking-wider mb-4">
						Maintenance
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<MetricCard
							title="Active Users"
							value={activeUsers}
							subtitle="Unique users with valid sessions"
							iconPath="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
						/>
						<MetricCard
							title="Active Sessions"
							value={activeSessions}
							subtitle="Open browser/device sessions"
							iconPath="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
						<MetricCard
							title="New Signups"
							value={`${newSignups7d} / ${newSignups30d}`}
							subtitle="Last 7 days / last 30 days"
							iconPath="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
						/>
					</div>
				</section>

				{/* Feature Usage */}
				<section>
					<h2 className="text-label text-muted text-sm font-medium uppercase tracking-wider mb-4">
						Feature Usage
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
						<MetricCard
							title="Total Groups"
							value={groupCount}
							subtitle="Organizations created"
							iconPath="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
						/>
						<MetricCard
							title="Meals Created"
							value={mealCount}
							subtitle="Recipes in galley"
							iconPath="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
						/>
						<MetricCard
							title="Active Selections"
							value={activeMealCount}
							subtitle="Meals on current menus"
							iconPath="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
						/>
						<MetricCard
							title="Grocery Lists"
							value={groceryListCount}
							subtitle="Shopping lists created"
							iconPath="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
						/>
						<MetricCard
							title="Items Scanned"
							value={scanCount}
							subtitle="Visual scan AI usage"
							iconPath="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
						/>
					</div>
				</section>

				{/* Platform Health */}
				<section>
					<h2 className="text-label text-muted text-sm font-medium uppercase tracking-wider mb-4">
						Platform Health
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
						<MetricCard
							title="Credit Balance"
							value={totalCredits}
							subtitle="Credits in circulation"
							iconPath="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
						<MetricCard
							title="Pending Invites"
							value={pendingInvites}
							subtitle="Awaiting acceptance"
							iconPath="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
						<MetricCard
							title="Expiring Soon"
							value={expiringItems}
							subtitle="Items expiring in 7 days"
							iconPath="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
						<MetricCard
							title="Email Verified"
							value={`${verifiedEmailRate.toFixed(1)}%`}
							subtitle="Users with verified email"
							iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</div>
				</section>

				{/* User Management */}
				<section>
					<h2 className="text-label text-muted text-sm font-medium uppercase tracking-wider mb-4">
						User Management
					</h2>
					<p className="text-sm text-muted mb-4">
						Search by name or email to find users and grant or revoke admin
						privileges.
					</p>
					<div className="glass-panel rounded-2xl p-6">
						<input
							type="search"
							placeholder="Search by name or email (min 2 chars)..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-full px-4 py-3 rounded-lg border border-carbon/10 bg-ceramic text-carbon placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-hyper-green/50 mb-6"
							aria-label="Search users"
						/>
						{isSearching && (
							<div className="text-sm text-muted mb-4">Searching...</div>
						)}
						{debouncedQuery.length >= 2 && !isSearching && (
							<div className="overflow-x-auto">
								{users.length === 0 ? (
									<p className="text-muted text-sm">No users found.</p>
								) : (
									<table className="w-full text-left">
										<thead>
											<tr className="border-b border-carbon/10">
												<th className="text-label text-muted py-3 pr-4">
													Name
												</th>
												<th className="text-label text-muted py-3 pr-4">
													Email
												</th>
												<th className="text-label text-muted py-3 pr-4">
													Status
												</th>
												<th className="text-label text-muted py-3 pr-4">
													Joined
												</th>
												<th className="text-label text-muted py-3 pr-4">
													Actions
												</th>
											</tr>
										</thead>
										<tbody>
											{users.map((user) => {
												const isSelf = user.id === currentUserId;
												const isConfirming = confirmingUserId === user.id;
												const isSubmitting =
													toggleFetcher.state === "submitting" &&
													toggleFetcher.formData?.get("userId") === user.id;
												return (
													<tr
														key={user.id}
														className={`border-b border-carbon/5 ${
															isSelf ? "bg-hyper-green/5" : ""
														}`}
													>
														<td className="py-3 pr-4 font-medium">
															{user.name}
														</td>
														<td className="py-3 pr-4 text-muted text-sm">
															{user.email}
														</td>
														<td className="py-3 pr-4">
															{user.isAdmin ? (
																<span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-hyper-green/20 text-hyper-green text-xs font-medium">
																	Admin
																</span>
															) : (
																<span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-platinum/50 text-muted text-xs font-medium">
																	User
																</span>
															)}
														</td>
														<td className="py-3 pr-4 text-muted text-sm">
															{user.createdAt
																? new Date(user.createdAt).toLocaleDateString()
																: "—"}
														</td>
														<td className="py-3 pr-4">
															{isSelf ? (
																<span
																	className="text-xs text-muted"
																	title="Cannot modify your own admin status"
																>
																	You
																</span>
															) : (
																<button
																	type="button"
																	onClick={() => handleToggleClick(user)}
																	onBlur={handleConfirmBlur}
																	disabled={isSubmitting}
																	className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
																		isConfirming
																			? "bg-warning/20 text-warning hover:bg-warning/30"
																			: user.isAdmin
																				? "bg-danger/10 text-danger hover:bg-danger/20"
																				: "bg-hyper-green/10 text-hyper-green hover:bg-hyper-green/20"
																	}`}
																>
																	{isSubmitting
																		? "Updating..."
																		: isConfirming
																			? "Confirm?"
																			: user.isAdmin
																				? "Revoke Admin"
																				: "Grant Admin"}
																</button>
															)}
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								)}
							</div>
						)}
					</div>
				</section>
			</main>
		</div>
	);
}
