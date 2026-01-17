// @ts-nocheck
import { getAuth } from "@clerk/react-router/ssr.server";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { redirect } from "react-router";
import * as schema from "../db/schema";
import { requireAdmin } from "../lib/auth.server";
import type { Route } from "./+types/admin";

export async function loader(args: Route.LoaderArgs) {
	const { userId } = await getAuth(args);

	if (!userId) {
		throw redirect("/sign-in");
	}

	// Verify Admin Access
	await requireAdmin(args.context, args.request, userId);

	const env = args.context.env as Env;
	const db = drizzle(env.DB, { schema });

	// Metrics Queries
	// 1. Total Users
	const userCount = await db.$count(schema.users);

	// 2. Total Inventory Items
	const inventoryCount = await db.$count(schema.inventory);

	// 3. Total Credits Burned (Sum of negative ledger amounts)
	// We want to sum the absolute value of negative amounts, or just sum them and invert.
	// Ledger amounts are positive (top-up) or negative (scan).
	// Let's just sum all negative amounts.
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
		<div className="min-h-screen bg-[#051105] text-[#39FF14] font-mono p-8 relative overflow-hidden">
			{/* Scanline Effect */}
			<div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] bg-repeat" />

			<header className="mb-12 border-b border-[#39FF14]/30 pb-4 flex justify-between items-center">
				<div>
					<h1 className="text-3xl font-black uppercase tracking-widest">
						GOD_MODE {"//"} <span className="text-white">OVERSEER</span>
					</h1>
					<p className="text-xs text-[#39FF14]/70 mt-1">
						SYSTEM TELEMETRY :: RESTRICTED ACCESS
					</p>
				</div>
				<div className="text-right">
					<div className="text-xs border border-[#39FF14] px-2 py-1 inline-block">
						STATUS: ONLINE
					</div>
				</div>
			</header>

			<main className="grid grid-cols-1 md:grid-cols-3 gap-8">
				{/* Card 1: Users */}
				<div className="border border-[#39FF14]/50 bg-[#0A1A0A] p-6 relative group overflow-hidden">
					<div className="absolute top-0 right-0 p-2 opacity-50">
						<svg
							className="w-12 h-12"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							role="img"
							aria-labelledby="subjects-icon-title"
						>
							<title id="subjects-icon-title">Subjects Icon</title>
							<path
								strokeLinecap="square"
								strokeLinejoin="miter"
								strokeWidth={1}
								d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
							/>
						</svg>
					</div>
					<h2 className="text-sm uppercase tracking-wider text-[#39FF14]/60 mb-2">
						Total Subjects
					</h2>
					<div className="text-5xl font-bold text-white tabular-nums">
						{userCount}
					</div>
					<div className="mt-4 text-xs font-mono text-[#39FF14]/40">
						ACTIVE BIOLOGICAL UNITS
					</div>
					{/* Chamfered Corner */}
					<div className="absolute bottom-0 right-0 w-4 h-4 bg-[#39FF14] clip-path-polygon-[100%_0,0_100%,100%_100%]" />
				</div>

				{/* Card 2: Inventory */}
				<div className="border border-[#39FF14]/50 bg-[#0A1A0A] p-6 relative group overflow-hidden">
					<div className="absolute top-0 right-0 p-2 opacity-50">
						<svg
							className="w-12 h-12"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							role="img"
							aria-labelledby="inventory-icon-title"
						>
							<title id="inventory-icon-title">Inventory Icon</title>
							<path
								strokeLinecap="square"
								strokeLinejoin="miter"
								strokeWidth={1}
								d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
							/>
						</svg>
					</div>
					<h2 className="text-sm uppercase tracking-wider text-[#39FF14]/60 mb-2">
						Matter Tracked
					</h2>
					<div className="text-5xl font-bold text-white tabular-nums">
						{inventoryCount}
					</div>
					<div className="mt-4 text-xs font-mono text-[#39FF14]/40">
						SKU DATABASE RECORDS
					</div>
					<div className="absolute bottom-0 right-0 w-4 h-4 bg-[#39FF14] clip-path-polygon-[100%_0,0_100%,100%_100%]" />
				</div>

				{/* Card 3: Economy */}
				<div className="border border-[#39FF14]/50 bg-[#0A1A0A] p-6 relative group overflow-hidden">
					<div className="absolute top-0 right-0 p-2 opacity-50">
						<svg
							className="w-12 h-12"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							role="img"
							aria-labelledby="economy-icon-title"
						>
							<title id="economy-icon-title">Economy Icon</title>
							<path
								strokeLinecap="square"
								strokeLinejoin="miter"
								strokeWidth={1}
								d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<h2 className="text-sm uppercase tracking-wider text-[#39FF14]/60 mb-2">
						Credits Burned
					</h2>
					<div className="text-5xl font-bold text-white tabular-nums">
						{burnedCredits}
					</div>
					<div className="mt-4 text-xs font-mono text-[#39FF14]/40">
						TOTAL ECONOMIC OUTPUT
					</div>
					<div className="absolute bottom-0 right-0 w-4 h-4 bg-[#39FF14] clip-path-polygon-[100%_0,0_100%,100%_100%]" />
				</div>
			</main>
		</div>
	);
}
