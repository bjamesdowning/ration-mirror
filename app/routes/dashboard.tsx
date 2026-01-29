import { Outlet } from "react-router";
import { BottomNav, RailSidebar } from "~/components/shell";
import { GroupSwitcher } from "~/components/shell/GroupSwitcher";
import { requireActiveGroup } from "~/lib/auth.server";
import { checkAndGenerateList } from "~/lib/automation.server";
import { checkBalance } from "~/lib/ledger.server";
import type { UserSettings } from "~/lib/types";
import type { Route } from "./+types/dashboard";

export async function loader({ request, context }: Route.LoaderArgs) {
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);

	// Lazy check for automated list generation
	// We don't await this to avoid blocking navigation?
	// Actually, for consistency, we probably should await it so the list is there when the page loads.
	// It's fast (D1 lookup + potential insert).
	await checkAndGenerateList(context, user.id, groupId);

	// biome-ignore lint/suspicious/noExplicitAny: better-auth user type misses custom schema fields
	const settings = ((user as any).settings as UserSettings) || {};
	const lastGeneratedAt = settings.listGeneration?.lastGeneratedAt || null;

	// Fetch fresh balance for the active group
	const balance = await checkBalance(context.cloudflare.env, groupId);

	return { lastGeneratedAt, balance };
}

export default function DashboardLayout() {
	return (
		<div className="flex min-h-screen bg-ceramic">
			{/* Desktop Rail Sidebar */}
			<RailSidebar />

			{/* Main Content Area */}
			<main className="flex-1 pb-20 md:pb-0 pt-0 min-w-0">
				{/* Global Top Bar (Group Context) */}
				<header className="px-4 md:px-8 py-3 flex justify-between items-center bg-ceramic/80 backdrop-blur-md sticky top-0 z-40 border-b border-platinum/50 h-16">
					<GroupSwitcher />
					{/* Add user profile or other global actions here if needed */}
				</header>

				{/* Content */}
				<div className="px-4 md:px-8 py-6">
					<Outlet />
				</div>
			</main>

			{/* Mobile Bottom Nav */}
			<BottomNav />
		</div>
	);
}
