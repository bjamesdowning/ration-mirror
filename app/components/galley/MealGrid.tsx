import type { meal } from "~/db/schema";
import { MealCard } from "./MealCard";

interface MealGridProps {
	meals: (typeof meal.$inferSelect & {
		tags?: string[];
		ingredients?: { quantity: number; unit: string }[];
	})[];
}

export function MealGrid({ meals }: MealGridProps) {
	if (meals.length === 0) {
		return (
			<div className="p-8 border border-dashed border-[#39FF14]/30 text-center text-[#39FF14]/50 font-mono uppercase">
				<p>NO MEAL DATA FOUND</p>
				<p className="text-sm mt-2">INITIATE CREATION SEQUENCE</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{meals.map((meal) => (
				<MealCard key={meal.id} meal={meal} />
			))}
		</div>
	);
}
