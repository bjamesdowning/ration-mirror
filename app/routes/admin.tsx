import { and, count, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { useCallback, useEffect, useState } from "react";
import { data, Link, useFetcher } from "react-router";

import * as schema from "../db/schema";
import { requireAdmin } from "../lib/auth.server";
import { handleApiError } from "../lib/error-handler";
import { ToggleAdminSchema } from "../lib/schemas/admin";
import type { Route } from "./+types/admin";

export async function loader(args: Route.LoaderArgs) {
	const adminUser = await requireAdmin(args.context, args.request);

	const env = args.context.cloudflare.env;
	const db = drizzle(env.DB, { schema });
	const now = new Date();
	const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
	const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
	const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

	const [
		// Overview totals
		userCount,
		inventoryCount,
		burnedResult,
		crewMemberCountResult,
		totalCreditsResult,
		// Activity / sessions
		activeUsersResult,
		activeSessionsResult,
		newSignups7dResult,
		newSignups30dResult,
		// 24h deltas
		newSignups24hResult,
		newCargo24hResult,
		newMeals24hResult,
		creditsAdded24hResult,
		creditsConsumed24hResult,
		aiCalls24hResult,
		crewConversions24hResult,
		// Feature usage totals
		groupCount,
		mealCount,
		activeMealCount,
		groceryListCount,
		scanCountResult,
		mealPlanCount,
		// Platform health
		pendingInvitesResult,
		expiringItemsResult,
		verifiedUsersResult,
		// Heavy hitters: top 5 orgs by cargo count
		topOrgsByCargoResult,
		// Heavy hitters: top 5 orgs by meal count
		topOrgsByMealResult,
		// Recent signups: last 10 users
		recentSignupsResult,
	] = await Promise.all([
		// ── Overview totals ──────────────────────────────────────────────────
		db.$count(schema.user),
		db.$count(schema.cargo),
		db
			.select({
				burned: sql<number>`sum(case when ${schema.ledger.amount} < 0 then abs(${schema.ledger.amount}) else 0 end)`,
			})
			.from(schema.ledger)
			.get(),
		db
			.select({ count: count() })
			.from(schema.user)
			.where(eq(schema.user.tier, "crew_member"))
			.get(),
		db
			.select({
				total: sql<number>`coalesce(sum(${schema.organization.credits}), 0)`,
			})
			.from(schema.organization)
			.get(),

		// ── Activity / sessions ──────────────────────────────────────────────
		db
			.select({
				count: sql<number>`count(distinct ${schema.session.userId})`,
			})
			.from(schema.session)
			.where(gt(schema.session.expiresAt, now))
			.get(),
		db
			.select({ count: count() })
			.from(schema.session)
			.where(gt(schema.session.expiresAt, now))
			.get(),
		db
			.select({ count: count() })
			.from(schema.user)
			.where(gt(schema.user.createdAt, sevenDaysAgo))
			.get(),
		db
			.select({ count: count() })
			.from(schema.user)
			.where(gt(schema.user.createdAt, thirtyDaysAgo))
			.get(),

		// ── 24h deltas ───────────────────────────────────────────────────────
		db
			.select({ count: count() })
			.from(schema.user)
			.where(gt(schema.user.createdAt, oneDayAgo))
			.get(),
		db
			.select({ count: count() })
			.from(schema.cargo)
			.where(gt(schema.cargo.createdAt, oneDayAgo))
			.get(),
		db
			.select({ count: count() })
			.from(schema.meal)
			.where(gt(schema.meal.createdAt, oneDayAgo))
			.get(),
		db
			.select({
				total: sql<number>`coalesce(sum(${schema.ledger.amount}), 0)`,
			})
			.from(schema.ledger)
			.where(
				and(
					gt(schema.ledger.amount, 0),
					gt(schema.ledger.createdAt, oneDayAgo),
				),
			)
			.get(),
		db
			.select({
				total: sql<number>`coalesce(sum(abs(${schema.ledger.amount})), 0)`,
			})
			.from(schema.ledger)
			.where(
				and(
					lt(schema.ledger.amount, 0),
					gt(schema.ledger.createdAt, oneDayAgo),
				),
			)
			.get(),
		// AI calls last 24h: any ledger debit that isn't a refund
		db
			.select({ count: count() })
			.from(schema.ledger)
			.where(
				and(
					lt(schema.ledger.amount, 0),
					gt(schema.ledger.createdAt, oneDayAgo),
				),
			)
			.get(),
		// Crew conversions 24h: users who became crew_member with tierExpiresAt set in the last 24h
		db
			.select({ count: count() })
			.from(schema.user)
			.where(
				and(
					eq(schema.user.tier, "crew_member"),
					gt(schema.user.tierExpiresAt, oneDayAgo),
				),
			)
			.get(),

		// ── Feature usage totals ─────────────────────────────────────────────
		db.$count(schema.organization),
		db.$count(schema.meal),
		db.$count(schema.activeMealSelection),
		db.$count(schema.supplyList),
		db
			.select({ count: count() })
			.from(schema.ledger)
			.where(eq(schema.ledger.reason, "scan"))
			.get(),
		db.$count(schema.mealPlan),

		// ── Platform health ──────────────────────────────────────────────────
		db
			.select({ count: count() })
			.from(schema.invitation)
			.where(eq(schema.invitation.status, "pending"))
			.get(),
		db
			.select({ count: count() })
			.from(schema.cargo)
			.where(
				and(
					gt(schema.cargo.expiresAt, now),
					lt(schema.cargo.expiresAt, sevenDaysFromNow),
				),
			)
			.get(),
		db
			.select({ count: count() })
			.from(schema.user)
			.where(eq(schema.user.emailVerified, true))
			.get(),

		// ── Heavy hitters: top 5 orgs by cargo ──────────────────────────────
		db
			.select({
				organizationId: schema.cargo.organizationId,
				itemCount: count(),
			})
			.from(schema.cargo)
			.groupBy(schema.cargo.organizationId)
			.orderBy(desc(count()))
			.limit(5),

		// ── Heavy hitters: top 5 orgs by meals ──────────────────────────────
		db
			.select({
				organizationId: schema.meal.organizationId,
				mealCount: count(),
			})
			.from(schema.meal)
			.groupBy(schema.meal.organizationId)
			.orderBy(desc(count()))
			.limit(5),

		// ── Recent signups: last 10 users ───────────────────────────────────
		db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				email: schema.user.email,
				createdAt: schema.user.createdAt,
			})
			.from(schema.user)
			.orderBy(desc(schema.user.createdAt))
			.limit(10),
	]);

	// Resolve org names for heavy hitters
	const heavyHitterOrgIds = Array.from(
		new Set([
			...topOrgsByCargoResult.map((r) => r.organizationId),
			...topOrgsByMealResult.map((r) => r.organizationId),
		]),
	);

	const orgNames: Record<string, string> = {};
	if (heavyHitterOrgIds.length > 0) {
		const orgs = await db
			.select({ id: schema.organization.id, name: schema.organization.name })
			.from(schema.organization)
			.where(inArray(schema.organization.id, heavyHitterOrgIds))
			.limit(10);
		for (const org of orgs) {
			orgNames[org.id] = org.name;
		}
	}

	return {
		currentUserId: adminUser.id,
		// Overview
		userCount,
		inventoryCount,
		burnedCredits: burnedResult?.burned || 0,
		crewMemberCount: crewMemberCountResult?.count ?? 0,
		totalCredits: totalCreditsResult?.total ?? 0,
		// Activity
		activeUsers: activeUsersResult?.count ?? 0,
		activeSessions: activeSessionsResult?.count ?? 0,
		newSignups7d: newSignups7dResult?.count ?? 0,
		newSignups30d: newSignups30dResult?.count ?? 0,
		// 24h deltas
		newSignups24h: newSignups24hResult?.count ?? 0,
		newCargo24h: newCargo24hResult?.count ?? 0,
		newMeals24h: newMeals24hResult?.count ?? 0,
		creditsAdded24h: creditsAdded24hResult?.total ?? 0,
		creditsConsumed24h: creditsConsumed24hResult?.total ?? 0,
		aiCalls24h: aiCalls24hResult?.count ?? 0,
		crewConversions24h: crewConversions24hResult?.count ?? 0,
		// Feature usage
		groupCount,
		mealCount,
		activeMealCount,
		groceryListCount,
		scanCount: scanCountResult?.count ?? 0,
		mealPlanCount,
		// Platform health
		pendingInvites: pendingInvitesResult?.count ?? 0,
		expiringItems: expiringItemsResult?.count ?? 0,
		verifiedEmailRate:
			userCount > 0 ? ((verifiedUsersResult?.count ?? 0) / userCount) * 100 : 0,
		// Heavy hitters
		topOrgsByCargo: topOrgsByCargoResult.map((r) => ({
			orgId: r.organizationId,
			orgName: orgNames[r.organizationId] ?? r.organizationId,
			count: r.itemCount,
		})),
		topOrgsByMeal: topOrgsByMealResult.map((r) => ({
			orgId: r.organizationId,
			orgName: orgNames[r.organizationId] ?? r.organizationId,
			count: r.mealCount,
		})),
		recentSignups: recentSignupsResult,
	};
}

export async function action(args: Route.ActionArgs) {
	const adminUser = await requireAdmin(args.context, args.request);

	if (args.request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const formData = await args.request.formData();
		const { userId } = ToggleAdminSchema.parse({
			intent: formData.get("intent"),
			userId: formData.get("userId"),
		});

		if (userId === adminUser.id) {
			return data(
				{ error: "Cannot modify your own admin status" },
				{ status: 400 },
			);
		}

		const db = drizzle(args.context.cloudflare.env.DB, { schema });
		const [existing] = await db
			.select({ isAdmin: schema.user.isAdmin })
			.from(schema.user)
			.where(eq(schema.user.id, userId))
			.limit(1);

		if (!existing) {
			return data({ error: "User not found" }, { status: 404 });
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

// ── Components ────────────────────────────────────────────────────────────────

function MetricCard({
	title,
	value,
	subtitle,
	iconPath,
	delta,
}: {
	title: string;
	value: string | number;
	subtitle: string;
	iconPath: string;
	delta?: number;
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
			<div className="mt-3 flex items-center gap-3">
				<span className="text-xs text-muted">{subtitle}</span>
				{delta !== undefined && (
					<span
						className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium tabular-nums ${
							delta > 0
								? "bg-hyper-green/15 text-hyper-green"
								: "bg-platinum/60 text-muted"
						}`}
					>
						+{delta.toLocaleString()} today
					</span>
				)}
			</div>
		</div>
	);
}

function SectionHeading({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="text-label text-muted text-sm font-medium uppercase tracking-wider mb-4">
			{children}
		</h2>
	);
}

type OrgRow = { orgId: string; orgName: string; count: number };

function HeavyHittersTable({
	title,
	rows,
	countLabel,
}: {
	title: string;
	rows: OrgRow[];
	countLabel: string;
}) {
	if (rows.length === 0) return null;
	return (
		<div className="glass-panel rounded-2xl p-6">
			<h3 className="text-sm font-medium text-carbon mb-4">{title}</h3>
			<table className="w-full text-left">
				<thead>
					<tr className="border-b border-carbon/10">
						<th className="text-label text-muted py-2 pr-4 text-xs">Org</th>
						<th className="text-label text-muted py-2 pr-4 text-xs text-right">
							{countLabel}
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row, i) => (
						<tr key={row.orgId} className="border-b border-carbon/5">
							<td className="py-2.5 pr-4">
								<span className="font-medium text-sm text-carbon">
									{row.orgName}
								</span>
								<span className="ml-2 text-xs text-muted font-mono">
									#{i + 1}
								</span>
							</td>
							<td className="py-2.5 text-right tabular-nums text-sm font-medium text-carbon">
								{row.count.toLocaleString()}
							</td>
						</tr>
					))}
				</tbody>
			</table>
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
		crewMemberCount,
		totalCredits,
		activeUsers,
		activeSessions,
		newSignups7d,
		newSignups30d,
		newSignups24h,
		newCargo24h,
		newMeals24h,
		creditsAdded24h,
		creditsConsumed24h,
		aiCalls24h,
		crewConversions24h,
		groupCount,
		mealCount,
		activeMealCount,
		groceryListCount,
		scanCount,
		mealPlanCount,
		pendingInvites,
		expiringItems,
		verifiedEmailRate,
		topOrgsByCargo,
		topOrgsByMeal,
		recentSignups,
	} = loaderData;

	const searchFetcher = useFetcher<{ users: SearchUser[] }>();
	const toggleFetcher = useFetcher();
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);
	// GDPR data minimisation: email is redacted by default in the passive recent-signups
	// list. Admin must click the eye icon to reveal a specific address.
	const [revealedEmailIds, setRevealedEmailIds] = useState<Set<string>>(
		new Set(),
	);
	const toggleEmailReveal = useCallback((id: string) => {
		setRevealedEmailIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

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
		<div className="min-h-screen bg-ceramic text-carbon p-4 md:p-8">
			<header className="mb-12 border-b border-carbon/10 pb-4 flex justify-between items-center">
				<div>
					<h1 className="text-display text-3xl text-carbon">Admin Dashboard</h1>
					<p className="text-sm text-muted mt-1">System overview and metrics</p>
				</div>
				<div className="flex items-center gap-4">
					<Link
						to="/hub"
						className="inline-flex items-center gap-2 px-4 py-2 btn-secondary rounded-lg font-medium"
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
					<SectionHeading>Overview</SectionHeading>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
						<MetricCard
							title="Total Users"
							value={userCount}
							subtitle="Registered accounts"
							iconPath="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
							delta={newSignups24h}
						/>
						<MetricCard
							title="Items Tracked"
							value={inventoryCount}
							subtitle="Total cargo entries"
							iconPath="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
							delta={newCargo24h}
						/>
						<MetricCard
							title="Crew Members"
							value={crewMemberCount}
							subtitle="Paid tier subscriptions"
							iconPath="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
							delta={crewConversions24h}
						/>
						<MetricCard
							title="Credits in Circulation"
							value={totalCredits}
							subtitle="Across all organizations"
							iconPath="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</div>
				</section>

				{/* Growth — 24h pulse */}
				<section>
					<SectionHeading>Growth — Last 24 Hours</SectionHeading>
					<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
						<MetricCard
							title="New Signups"
							value={newSignups24h}
							subtitle="Users joined today"
							iconPath="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
						/>
						<MetricCard
							title="Cargo Added"
							value={newCargo24h}
							subtitle="New pantry items"
							iconPath="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
						/>
						<MetricCard
							title="Meals Created"
							value={newMeals24h}
							subtitle="New recipes in galley"
							iconPath="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
						/>
						<MetricCard
							title="AI Operations"
							value={aiCalls24h}
							subtitle="Credit-bearing operations today"
							iconPath="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
						<MetricCard
							title="Credits Added"
							value={creditsAdded24h}
							subtitle="Top-ups and grants"
							iconPath="M12 4v16m8-8H4"
						/>
						<MetricCard
							title="Credits Consumed"
							value={creditsConsumed24h}
							subtitle="Burned by AI features"
							iconPath="M13 10V3L4 14h7v7l9-11h-7z"
						/>
						<MetricCard
							title="Crew Conversions"
							value={crewConversions24h}
							subtitle="Free → Crew upgrades"
							iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</div>
				</section>

				{/* Economy */}
				<section>
					<SectionHeading>Economy</SectionHeading>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<MetricCard
							title="Credits Burned (All Time)"
							value={burnedCredits}
							subtitle="Total credits consumed"
							iconPath="M13 10V3L4 14h7v7l9-11h-7z"
						/>
						<MetricCard
							title="Credits Added (24h)"
							value={creditsAdded24h}
							subtitle="Top-ups and grants today"
							iconPath="M12 4v16m8-8H4"
						/>
						<MetricCard
							title="Credits Burned (24h)"
							value={creditsConsumed24h}
							subtitle="Consumed by AI today"
							iconPath="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
						/>
					</div>
				</section>

				{/* Maintenance */}
				<section>
					<SectionHeading>Maintenance</SectionHeading>
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
					<SectionHeading>Feature Usage</SectionHeading>
					<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
						<MetricCard
							title="Groups"
							value={groupCount}
							subtitle="Organizations created"
							iconPath="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
						/>
						<MetricCard
							title="Meals"
							value={mealCount}
							subtitle="Recipes in galley"
							iconPath="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
							delta={newMeals24h}
						/>
						<MetricCard
							title="Active Selections"
							value={activeMealCount}
							subtitle="Meals on current menus"
							iconPath="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
						/>
						<MetricCard
							title="Supply Lists"
							value={groceryListCount}
							subtitle="Shopping lists created"
							iconPath="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
						/>
						<MetricCard
							title="Meal Plans"
							value={mealPlanCount}
							subtitle="Weekly plans created"
							iconPath="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
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
					<SectionHeading>Platform Health</SectionHeading>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
						<MetricCard
							title="Crew Rate"
							value={
								userCount > 0
									? `${((crewMemberCount / userCount) * 100).toFixed(1)}%`
									: "0%"
							}
							subtitle="Paid conversion rate"
							iconPath="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
						/>
					</div>
				</section>

				{/* Recent Signups */}
				<section>
					<SectionHeading>Recent Signups</SectionHeading>
					<p className="text-sm text-muted mb-4">Last 10 users who joined</p>
					<div className="glass-panel rounded-2xl p-6">
						{recentSignups.length === 0 ? (
							<p className="text-muted text-sm">No users yet.</p>
						) : (
							<table className="w-full text-left">
								<thead>
									<tr className="border-b border-carbon/10">
										<th className="text-label text-muted py-2 pr-4 text-xs">
											Name
										</th>
										<th className="text-label text-muted py-2 pr-4 text-xs">
											Email
										</th>
										<th className="text-label text-muted py-2 pr-4 text-xs">
											Joined
										</th>
									</tr>
								</thead>
								<tbody>
									{recentSignups.map((user) => {
										const isRevealed = revealedEmailIds.has(user.id);
										const redacted = user.email.replace(
											/^(.{1,2}).*?(@.*)$/,
											(_, a, b) => `${a}***${b}`,
										);
										return (
											<tr key={user.id} className="border-b border-carbon/5">
												<td className="py-2.5 pr-4 font-medium text-sm text-carbon">
													{user.name}
												</td>
												<td className="py-2.5 pr-4 text-muted text-sm">
													<span className="inline-flex items-center gap-1.5">
														<span className="font-mono text-xs">
															{isRevealed ? user.email : redacted}
														</span>
														<button
															type="button"
															onClick={() => toggleEmailReveal(user.id)}
															className="text-muted hover:text-carbon transition-colors"
															aria-label={
																isRevealed ? "Hide email" : "Reveal email"
															}
															title={isRevealed ? "Hide email" : "Reveal email"}
														>
															{isRevealed ? (
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	className="h-3.5 w-3.5"
																	viewBox="0 0 20 20"
																	fill="currentColor"
																	aria-hidden="true"
																>
																	<path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
																	<path
																		fillRule="evenodd"
																		d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
																		clipRule="evenodd"
																	/>
																</svg>
															) : (
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	className="h-3.5 w-3.5"
																	viewBox="0 0 20 20"
																	fill="currentColor"
																	aria-hidden="true"
																>
																	<path
																		fillRule="evenodd"
																		d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
																		clipRule="evenodd"
																	/>
																	<path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
																</svg>
															)}
														</button>
													</span>
												</td>
												<td className="py-2.5 text-muted text-sm">
													{user.createdAt
														? new Date(user.createdAt).toLocaleDateString()
														: "—"}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						)}
					</div>
				</section>

				{/* Heavy Hitters */}
				<section>
					<SectionHeading>Heavy Hitters</SectionHeading>
					<p className="text-sm text-muted mb-4">
						Top organizations by data volume. Flag any org that looks anomalous.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<HeavyHittersTable
							title="Top Orgs by Cargo Count"
							rows={topOrgsByCargo}
							countLabel="Items"
						/>
						<HeavyHittersTable
							title="Top Orgs by Meal Count"
							rows={topOrgsByMeal}
							countLabel="Meals"
						/>
					</div>
				</section>

				{/* User Management */}
				<section>
					<SectionHeading>User Management</SectionHeading>
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
