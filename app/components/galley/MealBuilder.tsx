import { Form, type useFetcher } from "react-router";
import { DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import type { MealInput } from "~/lib/schemas/meal"; // Implied type
import { DirectionsEditor } from "./DirectionsEditor";
import { IngredientPicker } from "./IngredientPicker";

// Helper type for inventory item from DB
type InventoryItem = {
	id: string;
	name: string;
	unit: string;
	quantity: number;
};

interface MealBuilderProps {
	availableIngredients?: InventoryItem[];
	defaultValue?: Partial<MealInput>;
	actionUrl?: string;
	method?: "post" | "put";
	fetcher?: ReturnType<typeof useFetcher<unknown>>;
	children?: React.ReactNode;
	submitLabel?: string;
}

export function MealBuilder({
	availableIngredients = [],
	defaultValue = {},
	method = "post",
	fetcher,
	children,
	submitLabel,
}: MealBuilderProps) {
	const FormComponent = fetcher ? fetcher.Form : Form;

	return (
		<FormComponent method={method} className="space-y-8">
			{children}

			{/* Basic Info */}
			<div className="glass-panel rounded-xl p-6">
				<h3 className="text-label text-muted mb-4 border-b border-platinum pb-4">
					Meal Details
				</h3>
				<div className="space-y-6">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="flex flex-col gap-2">
							<label htmlFor="name" className="text-label text-muted text-sm">
								Name
							</label>
							<input
								type="text"
								inputMode="text"
								name="name"
								id="name"
								defaultValue={defaultValue.name}
								required
								className="bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
								placeholder="Enter meal name"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label htmlFor="domain" className="text-label text-muted text-sm">
								Domain
							</label>
							<select
								name="domain"
								id="domain"
								defaultValue={defaultValue.domain ?? "food"}
								className="bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							>
								{ITEM_DOMAINS.map((domain) => (
									<option key={domain} value={domain}>
										{DOMAIN_LABELS[domain]}
									</option>
								))}
							</select>
						</div>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="flex flex-col gap-2">
							<label
								htmlFor="servings"
								className="text-label text-muted text-sm"
							>
								Servings
							</label>
							<input
								type="number"
								inputMode="numeric"
								name="servings"
								id="servings"
								defaultValue={defaultValue.servings || 1}
								min={1}
								className="bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label
								htmlFor="description"
								className="text-label text-muted text-sm"
							>
								Description
							</label>
							<input
								type="text"
								inputMode="text"
								name="description"
								id="description"
								defaultValue={defaultValue.description}
								className="bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
								placeholder="Optional description"
							/>
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<label htmlFor="tags" className="text-label text-muted text-sm">
							Tags
						</label>
						<input
							type="text"
							inputMode="text"
							name="tags"
							id="tags"
							defaultValue={defaultValue.tags?.join(", ")}
							className="bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							placeholder="e.g. breakfast, quick, vegetarian (comma separated)"
						/>
						<span className="text-xs text-muted">
							Comma-separated list for filtering
						</span>
					</div>

					<div className="flex flex-col gap-2">
						<label
							htmlFor="equipment"
							className="text-label text-muted text-sm"
						>
							Required Equipment
						</label>
						<input
							type="text"
							inputMode="text"
							name="equipment"
							id="equipment"
							defaultValue={defaultValue.equipment?.join(", ")}
							className="bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							placeholder="e.g. oven, blender, cast iron pan (comma separated)"
						/>
						<span className="text-xs text-muted">
							Comma-separated list of tools needed
						</span>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="flex flex-col gap-2">
							<label
								htmlFor="prepTime"
								className="text-label text-muted text-sm"
							>
								Prep Time (min)
							</label>
							<input
								type="number"
								inputMode="numeric"
								name="prepTime"
								id="prepTime"
								defaultValue={defaultValue.prepTime}
								className="bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<label
								htmlFor="cookTime"
								className="text-label text-muted text-sm"
							>
								Cook Time (min)
							</label>
							<input
								type="number"
								inputMode="numeric"
								name="cookTime"
								id="cookTime"
								defaultValue={defaultValue.cookTime}
								className="bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							/>
						</div>
					</div>
				</div>
			</div>

			{/* Ingredients */}
			<div className="border-b border-platinum pb-6 mb-6">
				<h3 className="text-label text-muted mb-4">Ingredients</h3>
				<IngredientPicker
					defaultValue={defaultValue.ingredients}
					availableIngredients={availableIngredients}
				/>
			</div>

			{/* Directions */}
			<div className="border-b border-platinum pb-6 mb-6">
				<h3 className="text-label text-muted mb-4">Directions</h3>
				<DirectionsEditor defaultValue={defaultValue.directions} />
			</div>

			{/* Actions */}
			<div className="flex justify-end gap-4 pt-4">
				<button
					type="submit"
					className="bg-hyper-green text-carbon font-bold px-8 py-3 rounded-xl shadow-glow-sm hover:shadow-glow w-full md:w-auto transition-all"
				>
					{submitLabel || (method === "post" ? "Create Recipe" : "Update Meal")}
				</button>
			</div>
		</FormComponent>
	);
}
