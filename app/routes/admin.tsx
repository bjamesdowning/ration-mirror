import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Link } from "react-router";

import * as schema from "../db/schema";
import { requireAdmin } from "../lib/auth.server";
import type { Route } from "./+types/admin";

export async function loader(args: Route.LoaderArgs) {
	// Verify Admin Access (this handles auth check too)
	await requireAdmin(args.context, args.request);

	const env = args.context.cloudflare.env;
	const db = drizzle(env.DB, { schema });

	// Metrics Queries
	// 1. Total Users
	const userCount = await db.$count(schema.user);

	// 2. Total Inventory Items
	const inventoryCount = await db.$count(schema.inventory);

	// 3. Total Credits Burned (Sum of negative ledger amounts)
	const burnedResult = await db
		.select({
			burned: sql<number>`sum(case when ${schema.ledger.amount} < 0 then abs(${schema.ledger.amount}) else 0 end)`,
		})
		.from(schema.ledger)
		.get();

	return {
		userCount,
		inventoryCount,
		burnedCredits: burnedResult?.burned || 0,
	};
}

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
	const { userCount, inventoryCount, burnedCredits } = loaderData;

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

			<main className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl">
				{/* Card 1: Users */}
				<div className="glass-panel rounded-2xl p-6 relative group">
					<div className="absolute top-4 right-4 opacity-30 group-hover:opacity-50 transition-opacity">
						<svg
							className="w-12 h-12 text-hyper-green"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							role="img"
							aria-labelledby="users-icon-title"
						>
							<title id="users-icon-title">Users Icon</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
							/>
						</svg>
					</div>
					<h2 className="text-label text-muted mb-2">Total Users</h2>
					<div className="text-display text-5xl text-carbon tabular-nums">
						{userCount.toLocaleString()}
					</div>
					<div className="mt-4 text-xs text-muted">Registered accounts</div>
				</div>

				{/* Card 2: Inventory */}
				<div className="glass-panel rounded-2xl p-6 relative group">
					<div className="absolute top-4 right-4 opacity-30 group-hover:opacity-50 transition-opacity">
						<svg
							className="w-12 h-12 text-hyper-green"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							role="img"
							aria-labelledby="inventory-icon-title"
						>
							<title id="inventory-icon-title">Inventory Icon</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
							/>
						</svg>
					</div>
					<h2 className="text-label text-muted mb-2">Items Tracked</h2>
					<div className="text-display text-5xl text-carbon tabular-nums">
						{inventoryCount.toLocaleString()}
					</div>
					<div className="mt-4 text-xs text-muted">Total inventory entries</div>
				</div>

				{/* Card 3: Economy */}
				<div className="glass-panel rounded-2xl p-6 relative group">
					<div className="absolute top-4 right-4 opacity-30 group-hover:opacity-50 transition-opacity">
						<svg
							className="w-12 h-12 text-hyper-green"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							role="img"
							aria-labelledby="economy-icon-title"
						>
							<title id="economy-icon-title">Credits Icon</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<h2 className="text-label text-muted mb-2">Credits Used</h2>
					<div className="text-display text-5xl text-carbon tabular-nums">
						{burnedCredits.toLocaleString()}
					</div>
					<div className="mt-4 text-xs text-muted">Total credits consumed</div>
				</div>
			</main>
		</div>
	);
}
