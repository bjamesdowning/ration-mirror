import { Outlet } from "react-router";
import { BottomNav, RailSidebar } from "~/components/shell";
import { requireAuth } from "~/lib/auth.server";
import { checkAndGenerateList } from "~/lib/automation.server";
import type { UserSettings } from "~/lib/types";
import type { Route } from "./+types/dashboard";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { user } = await requireAuth(context, request);

	// Lazy check for automated list generation
	// We don't await this to avoid blocking navigation?
	// Actually, for consistency, we probably should await it so the list is there when the page loads.
	// It's fast (D1 lookup + potential insert).
	await checkAndGenerateList(context, user.id);

	// biome-ignore lint/suspicious/noExplicitAny: better-auth user type misses custom schema fields
	const settings = ((user as any).settings as UserSettings) || {};
	const lastGeneratedAt = settings.listGeneration?.lastGeneratedAt || null;

	return { lastGeneratedAt };
}

export default function DashboardLayout() {
	return (
		<div className="flex min-h-screen bg-ceramic">
			{/* Desktop Rail Sidebar */}
			<RailSidebar />

			{/* Main Content Area */}
			<main className="flex-1 pb-20 md:pb-0 pt-0">
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
