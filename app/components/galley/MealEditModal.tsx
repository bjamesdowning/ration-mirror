import type { useFetcher } from "react-router";
import { MealBuilder } from "~/components/galley/MealBuilder";
import type { meal } from "~/db/schema";
import type { MealInput } from "~/lib/schemas/meal"; // Implied type

// Helper type matching MealBuilder's expectation
type InventoryItem = {
	id: string;
	name: string;
	unit: string;
	quantity: number;
};

interface MealEditModalProps {
	meal: typeof meal.$inferSelect & {
		tags?: string[];
		ingredients?: {
			inventoryId?: string | null;
			ingredientName: string;
			quantity: number;
			unit: string;
			isOptional?: boolean | null;
			orderIndex?: number | null;
		}[];
		equipment?: string[] | null;
		customFields?: Record<string, any> | null;
	};
	availableIngredients: InventoryItem[];
	onClose: () => void;
	fetcher: ReturnType<typeof useFetcher<unknown>>;
	isUpdating: boolean;
}

export function MealEditModal({
	meal,
	availableIngredients,
	onClose,
	fetcher,
}: MealEditModalProps) {
	// Transform DB meal to MealInput for the form
	const defaultValues: Partial<MealInput> = {
		name: meal.name,
		description: meal.description || undefined,
		servings: meal.servings || 1,
		prepTime: meal.prepTime || undefined,
		cookTime: meal.cookTime || undefined,
		tags: meal.tags || [],
		equipment: meal.equipment || [],
		customFields: meal.customFields || {},
		directions: meal.directions || undefined,
		ingredients: (meal.ingredients || []).map((ing) => ({
			inventoryId: ing.inventoryId,
			ingredientName: ing.ingredientName,
			quantity: ing.quantity,
			unit: ing.unit,
			isOptional: ing.isOptional || false,
			orderIndex: ing.orderIndex || 0,
		})),
	};

	return (
		<div className="fixed inset-0 bg-carbon/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
			<div className="bg-ceramic rounded-2xl shadow-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
				<div className="flex justify-between items-center mb-6">
					<h2 className="text-xl font-bold text-carbon">Edit Recipe</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-muted hover:text-carbon text-2xl transition-colors"
					>
						×
					</button>
				</div>

				<MealBuilder
					availableIngredients={availableIngredients}
					defaultValue={defaultValues}
					method="post"
					fetcher={fetcher}
				>
					<input type="hidden" name="intent" value="update" />
					<input type="hidden" name="mealId" value={meal.id} />
				</MealBuilder>
			</div>
		</div>
	);
}
