import { Form } from "react-router";
import type { MealInput } from "~/lib/schemas/meal"; // Implied type
import { DirectionsEditor } from "./DirectionsEditor";
import { IngredientPicker } from "./IngredientPicker";

interface MealBuilderProps {
	defaultValue?: Partial<MealInput>;
	actionUrl?: string;
	method?: "post" | "put";
}

export function MealBuilder({
	defaultValue = {},
	method = "post",
}: MealBuilderProps) {
	return (
		<Form method={method} className="space-y-8 font-mono text-[#39FF14]">
			{/* Basic Info */}
			<div className="space-y-4">
				<h3 className="text-sm uppercase border-b border-[#39FF14] pb-2">
					Protocol Specification
				</h3>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="flex flex-col gap-2">
						<label htmlFor="name" className="text-xs uppercase opacity-70">
							Designation
						</label>
						<input
							type="text"
							name="name"
							id="name"
							defaultValue={defaultValue.name}
							required
							className="bg-transparent border-b border-[#39FF14]/50 p-2 focus:outline-none focus:border-[#39FF14]"
							placeholder="ENTER MEAL NAME"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="servings" className="text-xs uppercase opacity-70">
							Yield
						</label>
						<input
							type="number"
							name="servings"
							id="servings"
							defaultValue={defaultValue.servings || 1}
							min={1}
							className="bg-transparent border-b border-[#39FF14]/50 p-2 focus:outline-none focus:border-[#39FF14]"
						/>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<label htmlFor="description" className="text-xs uppercase opacity-70">
						Brief
					</label>
					<input
						type="text"
						name="description"
						id="description"
						defaultValue={defaultValue.description}
						className="bg-transparent border-b border-[#39FF14]/50 p-2 focus:outline-none focus:border-[#39FF14]"
						placeholder="OPTIONAL DESCRIPTION"
					/>
				</div>

				<div className="flex flex-col gap-2">
					<label htmlFor="tags" className="text-xs uppercase opacity-70">
						Classification Tags
					</label>
					<input
						type="text"
						name="tags"
						id="tags"
						defaultValue={defaultValue.tags?.join(", ")}
						className="bg-transparent border-b border-[#39FF14]/50 p-2 focus:outline-none focus:border-[#39FF14]"
						placeholder="E.G. BREAKFAST, QUICK, VEGETARIAN (COMMA SEPARATED)"
					/>
					<span className="text-[10px] opacity-50">
						COMMA-SEPARATED LIST FOR FILTERING
					</span>
				</div>

				<div className="flex flex-col gap-2">
					<label htmlFor="equipment" className="text-xs uppercase opacity-70">
						Required Equipment
					</label>
					<input
						type="text"
						name="equipment"
						id="equipment"
						defaultValue={defaultValue.equipment?.join(", ")}
						className="bg-transparent border-b border-[#39FF14]/50 p-2 focus:outline-none focus:border-[#39FF14]"
						placeholder="E.G. OVEN, BLENDER, CAST IRON PAN (COMMA SEPARATED)"
					/>
					<span className="text-[10px] opacity-50">
						COMMA-SEPARATED LIST OF TOOLS NEEDED
					</span>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div className="flex flex-col gap-2">
						<label htmlFor="prepTime" className="text-xs uppercase opacity-70">
							Prep Time (min)
						</label>
						<input
							type="number"
							name="prepTime"
							id="prepTime"
							defaultValue={defaultValue.prepTime}
							className="bg-transparent border-b border-[#39FF14]/50 p-2 focus:outline-none focus:border-[#39FF14]"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="cookTime" className="text-xs uppercase opacity-70">
							Cook Time (min)
						</label>
						<input
							type="number"
							name="cookTime"
							id="cookTime"
							defaultValue={defaultValue.cookTime}
							className="bg-transparent border-b border-[#39FF14]/50 p-2 focus:outline-none focus:border-[#39FF14]"
						/>
					</div>
				</div>
			</div>

			{/* Ingredients */}
			<div className="space-y-4">
				<h3 className="text-sm uppercase border-b border-[#39FF14] pb-2">
					Material Components
				</h3>
				<IngredientPicker defaultValue={defaultValue.ingredients} />
			</div>

			{/* Directions */}
			<div className="space-y-4">
				<h3 className="text-sm uppercase border-b border-[#39FF14] pb-2">
					Execution Sequence
				</h3>
				<DirectionsEditor defaultValue={defaultValue.directions} />
			</div>

			{/* Actions */}
			<div className="flex justify-end gap-4 border-t border-[#39FF14]/30 pt-4">
				<button
					type="submit"
					className="px-6 py-2 bg-[#39FF14] text-black font-bold uppercase tracking-widest hover:bg-[#2bff00] shadow-[0_0_15px_rgba(57,255,20,0.5)] transition-all"
				>
					{method === "post" ? "INITIALIZE" : "UPDATE PROTOCOL"}
				</button>
			</div>
		</Form>
	);
}
