import { Link, useFetcher } from "react-router";
import type { meal } from "~/db/schema";

interface MealCardProps {
	meal: typeof meal.$inferSelect & {
		tags?: string[];
		ingredients?: { quantity: number; unit: string }[];
	};
}

export function MealCard({ meal }: MealCardProps) {
	const fetcher = useFetcher();
	const isDeleting =
		fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";

	if (isDeleting) return null;

	return (
		<Link
			to={`/dashboard/meals/${meal.id}`}
			className="block relative group p-4 border border-[#39FF14] bg-[#051105]/90 font-mono text-[#39FF14] hover:bg-[#0a220a] transition-colors"
		>
			<div className="flex justify-between items-start mb-2">
				<h3
					className="text-lg font-bold uppercase tracking-wider truncate mr-2"
					title={meal.name}
				>
					{meal.name}
				</h3>
				<div className="text-right">
					<span className="text-xs opacity-70 block">PREP</span>
					<span className="text-sm font-bold">
						{meal.prepTime ? `${meal.prepTime}m` : "--"}
					</span>
				</div>
			</div>

			<div className="flex flex-wrap gap-2 mb-4">
				{(meal.tags || []).map((tag) => (
					<span
						key={tag}
						className="text-[10px] px-1 py-0.5 border border-[#39FF14]/50 opacity-80 uppercase"
					>
						{tag}
					</span>
				))}
			</div>

			<div className="flex justify-between items-end mt-4">
				<div className="text-xs opacity-70">
					<div>SERVINGS: {meal.servings}</div>
					<div>COMPLEXITY: {meal.ingredients?.length || 0} ITEMS</div>
				</div>

				<div className="absolute top-4 right-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
					<span className="px-2 py-1 bg-[#39FF14] text-black text-xs font-bold uppercase">
						ACCESS DATA
					</span>
				</div>
			</div>
		</Link>
	);
}
