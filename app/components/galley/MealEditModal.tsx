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
		customFields?: Record<string, unknown> | null;
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
	const normalizeCustomFields = (
		customFields: Record<string, unknown> | null | undefined,
	): Record<string, string> => {
		if (!customFields) return {};
		return Object.fromEntries(
			Object.entries(customFields).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		);
	};

	// Transform DB meal to MealInput for the form
	const defaultValues: Partial<MealInput> = {
		name: meal.name,
		domain: (meal.domain ?? "food") as MealInput["domain"],
		description: meal.description || undefined,
		servings: meal.servings || 1,
		prepTime: meal.prepTime || undefined,
		cookTime: meal.cookTime || undefined,
		tags: meal.tags || [],
		equipment: meal.equipment || [],
		customFields: normalizeCustomFields(
			meal.customFields as Record<string, unknown> | null,
		),
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

				{(fetcher.data as { error?: string })?.error && (
					<div className="bg-danger/10 text-danger px-4 py-3 rounded-xl mb-6 text-sm flex items-center gap-2">
						<span className="text-lg">⚠️</span>
						{(fetcher.data as { error?: string }).error}
					</div>
				)}

				<MealBuilder
					availableIngredients={availableIngredients}
					defaultValue={defaultValues}
					method="post"
					fetcher={fetcher}
					submitLabel="Save Changes"
				>
					<input type="hidden" name="intent" value="update" />
					<input type="hidden" name="mealId" value={meal.id} />
				</MealBuilder>
			</div>
		</div>
	);
}
