/** Operation types erased with personal intake. Shared so purge cannot drift. */
export const DIARY_NUTRITION_OPERATION_TYPES = [
	"log_diary_food",
	"update_diary_food",
	"void_diary_food",
	"save_diary_food_to_kitchen",
] as const;

export type DiaryNutritionOperationType =
	(typeof DIARY_NUTRITION_OPERATION_TYPES)[number];

export const INTAKE_ERASE_OPERATION_TYPES = [
	"log_manifest_intakes",
	"clear_manifest_intakes",
	...DIARY_NUTRITION_OPERATION_TYPES,
] as const;
