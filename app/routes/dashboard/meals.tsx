import { Link } from "react-router";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { MealGrid } from "~/components/galley/MealGrid";
import { requireAuth } from "~/lib/auth.server";
import { getMeals } from "~/lib/meals.server";
import type { Route } from "./+types/meals";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { user } = await requireAuth(context, request);
	const url = new URL(request.url);
	const tag = url.searchParams.get("tag") || undefined;

	const meals = await getMeals(context.cloudflare.env.DB, user.id, tag);
	return { meals };
}

export default function MealsIndex({ loaderData }: Route.ComponentProps) {
	const { meals } = loaderData;

	return (
		<>
			<DashboardHeader
				title="GALLEY OPS"
				subtitle="protocols // loaded"
				showSearch={false}
				totalItems={meals.length}
			/>

			<div className="space-y-8">
				<div className="flex justify-end">
					<Link
						to="new"
						className="px-6 py-2 bg-[#39FF14] text-black font-bold uppercase tracking-widest hover:bg-[#2bff00] shadow-[0_0_15px_rgba(57,255,20,0.5)] transition-all"
					>
						+ NEW PROTOCOL
					</Link>
				</div>

				<MealGrid meals={meals} />
			</div>
		</>
	);
}
