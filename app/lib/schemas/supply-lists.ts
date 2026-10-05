import { z } from "zod";
import { ITEM_DOMAINS } from "../domain";
import { SUPPLY_CATEGORIES } from "../supply-categories";
import {
	SUPPLY_CREATED_FROM,
	SUPPLY_LIST_NOTE_MAX,
	SUPPLY_SAVED_ITEM_LIMIT,
} from "../supply-list-kinds";
import { UnitSchema } from "./units";

export const SupplyListKindCreateSchema = z.enum(["saved", "template"]);
export const SupplyCopyModeSchema = z.enum(["missing_only", "add_all"]);
export const SupplyTransferModeSchema = z.enum(["copy", "move"]);

export const SupplyCatalogCreateSchema = z.object({
	name: z.string().trim().min(1).max(100),
	kind: SupplyListKindCreateSchema.default("saved"),
	seed: z
		.object({
			type: z.enum(["empty", "copy"]).default("empty"),
			sourceListId: z.string().uuid().optional(),
			resetPurchased: z.boolean().optional(),
		})
		.optional(),
	clientKey: z.string().uuid().optional(),
});

export const SupplyListDuplicateSchema = z.object({
	name: z.string().trim().min(1).max(100).optional(),
	kind: SupplyListKindCreateSchema.optional(),
	resetPurchased: z.boolean().optional(),
	clientKey: z.string().uuid().optional(),
});

export const SupplyListArchiveSchema = z.object({
	clientKey: z.string().uuid().optional(),
});

export const SupplyCopyToLiveSchema = z.object({
	mode: SupplyCopyModeSchema.default("missing_only"),
	itemIds: z.array(z.string().uuid()).max(SUPPLY_SAVED_ITEM_LIMIT).optional(),
});

export const SupplyItemsTransferSchema = z.object({
	targetListId: z.string().uuid(),
	itemIds: z.array(z.string().uuid()).min(1).max(SUPPLY_SAVED_ITEM_LIMIT),
	mode: SupplyTransferModeSchema,
});

export const SupplyReceiptItemSchema = z.object({
	name: z.string().trim().min(1).max(200),
	quantity: z.coerce.number().min(0).default(1),
	unit: UnitSchema.default("unit"),
	domain: z.enum(ITEM_DOMAINS).default("food"),
	category: z.enum(SUPPLY_CATEGORIES).optional(),
	note: z.string().max(SUPPLY_LIST_NOTE_MAX).optional(),
});

export const SupplyFromReceiptSchema = z.object({
	scanRequestId: z.string().min(1).max(128),
	name: z.string().trim().min(1).max(100),
	items: z.array(SupplyReceiptItemSchema).min(1).max(SUPPLY_SAVED_ITEM_LIMIT),
	clientKey: z.string().uuid().optional(),
});

export const SupplyStapleSchema = z.object({
	name: z.string().trim().min(1).max(200),
	quantity: z.coerce.number().min(0).default(1),
	unit: UnitSchema.default("unit"),
	domain: z.enum(ITEM_DOMAINS).default("food"),
	category: z.enum(SUPPLY_CATEGORIES).optional(),
	note: z.string().max(SUPPLY_LIST_NOTE_MAX).optional(),
});

export const SupplyAddStaplesSchema = z.object({
	stapleIds: z.array(z.string().uuid()).min(1).max(50),
});

export const SupplyStoreAisleSchema = z.object({
	category: z.enum(SUPPLY_CATEGORIES),
	sortOrder: z.coerce.number().int().min(0),
});

export const SupplyStoreProfileSchema = z.object({
	name: z.string().trim().min(1).max(100),
	aisles: z
		.array(SupplyStoreAisleSchema)
		.max(SUPPLY_CATEGORIES.length)
		.optional(),
});

export const SupplyOperationTypeSchema = z.enum([
	"add_item",
	"update_item",
	"delete_item",
	"toggle_purchased",
	"reset_purchased",
]);

export const SupplyOperationSchema = z.object({
	operationId: z.string().uuid(),
	type: SupplyOperationTypeSchema,
	itemId: z.string().uuid().optional(),
	payload: z
		.object({
			name: z.string().min(1).max(200).optional(),
			quantity: z.coerce.number().min(0).optional(),
			unit: UnitSchema.optional(),
			domain: z.enum(ITEM_DOMAINS).optional(),
			note: z.string().max(SUPPLY_LIST_NOTE_MAX).nullable().optional(),
			category: z.enum(SUPPLY_CATEGORIES).nullable().optional(),
			isPurchased: z.boolean().optional(),
			sortOrder: z.coerce.number().int().optional(),
		})
		.optional(),
});

export const SupplyOperationsBatchSchema = z.object({
	baseRevision: z.coerce.number().int().min(0),
	operations: z.array(SupplyOperationSchema).min(1).max(50),
});

export const SupplyBarcodeLookupSchema = z.object({
	barcode: z.string().trim().min(4).max(32),
});

export const SupplyCreatedFromSchema = z.enum(SUPPLY_CREATED_FROM);
