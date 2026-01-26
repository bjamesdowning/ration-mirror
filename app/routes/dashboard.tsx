import { Outlet } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import type { Route } from "./+types/dashboard";

export async function loader({ request, context }: Route.LoaderArgs) {
	await requireAuth(context, request);
	return {};
}

export default function DashboardLayout() {
	return (
		<div className="min-h-screen bg-[#051105] text-[#39FF14] font-mono p-4 md:p-8">
			<Outlet />
		</div>
	);
}
