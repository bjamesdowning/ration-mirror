import { Outlet } from "react-router";
import { Status } from "~/components/hud/Status";
import { BottomNav, RailSidebar } from "~/components/shell";
import { requireAuth } from "~/lib/auth.server";
import type { Route } from "./+types/dashboard";

export async function loader({ request, context }: Route.LoaderArgs) {
	await requireAuth(context, request);
	return {};
}

export default function DashboardLayout() {
	return (
		<div className="flex min-h-screen bg-ceramic">
			{/* Desktop Rail Sidebar */}
			<RailSidebar />

			{/* Main Content Area */}
			<main className="flex-1 pb-20 md:pb-0">
				{/* Status bar - light theme */}
				<Status />

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
