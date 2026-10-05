import { data } from "react-router";
import { handleApiError } from "./error-handler";
import type { buildWebFlagContext } from "./feature-flags/context.server";
import { checkRateLimit, rateLimitResponse } from "./rate-limiter.server";
import {
	SupplyBulkAddSchema,
	SupplyCatalogCreateSchema,
	SupplyCopyToLiveSchema,
	SupplyFromReceiptSchema,
	SupplyItemsTransferSchema,
	SupplyListDuplicateSchema,
	SupplyOperationsBatchSchema,
} from "./schemas/supply-lists";
import { getSupplyListById } from "./supply.server";
import { resolveSupplyListTarget } from "./supply-list-access.server";
import { parseIfNoneMatch, supplyListEtag } from "./supply-list-dto.server";
import { assertSupplyMultiListsEnabled } from "./supply-list-flag.server";
import {
	addSupplyItemsBulk,
	applySupplyOperations,
	archiveSupplyList,
	copyItemsToLive,
	createCatalogList,
	createSupplyListFromReceipt,
	duplicateSupplyList,
	getSupplyCatalog,
	resetPurchasedSupplyItems,
	snapshotLiveSupplyList,
	transferSupplyItems,
} from "./supply-lists.server";
import { parseSupplyQuickAdd } from "./supply-quick-add";

type AuthSlice = {
	env: Env;
	request: Request;
	userId: string;
	organizationId: string;
	flagContext: ReturnType<typeof buildWebFlagContext>;
};

export async function handleSupplyCatalogGet(auth: AuthSlice) {
	try {
		await assertSupplyMultiListsEnabled(auth.env, auth.flagContext);
		const rate = await checkRateLimit(
			auth.env.RATION_KV,
			"supply_catalog_read",
			auth.userId,
		);
		if (!rate.allowed) {
			throw rateLimitResponse(rate, "Too many supply catalog requests.");
		}
		const catalog = await getSupplyCatalog(auth.env, auth.organizationId);
		const revision = catalog.live?.revision ?? 0;
		const noneMatch = parseIfNoneMatch(
			auth.request.headers.get("If-None-Match"),
		);
		if (noneMatch != null && noneMatch === revision) {
			return new Response(null, {
				status: 304,
				headers: { ETag: supplyListEtag(revision) },
			});
		}
		return data(catalog, { headers: { ETag: supplyListEtag(revision) } });
	} catch (error) {
		return handleApiError(error);
	}
}

export async function handleSupplyCatalogCreate(
	auth: AuthSlice,
	body: unknown,
) {
	try {
		await assertSupplyMultiListsEnabled(auth.env, auth.flagContext);
		const rate = await checkRateLimit(
			auth.env.RATION_KV,
			"grocery_mutation",
			auth.userId,
		);
		if (!rate.allowed) {
			throw rateLimitResponse(
				rate,
				"Too many requests. Please try again later.",
			);
		}
		const input = SupplyCatalogCreateSchema.parse(body);
		const list =
			input.seed?.type === "copy" && !input.seed.sourceListId
				? await snapshotLiveSupplyList({
						env: auth.env,
						organizationId: auth.organizationId,
						name: input.name,
						clientKey: input.clientKey,
					})
				: await createCatalogList({
						env: auth.env,
						organizationId: auth.organizationId,
						name: input.name,
						kind: input.kind,
						seed: input.seed,
						clientKey: input.clientKey,
					});
		return { list };
	} catch (error) {
		return handleApiError(error);
	}
}

export async function handleSupplyDuplicate(
	auth: AuthSlice,
	listId: string,
	body: unknown,
) {
	try {
		await assertSupplyMultiListsEnabled(auth.env, auth.flagContext);
		const input = SupplyListDuplicateSchema.parse(body ?? {});
		const list = await duplicateSupplyList({
			env: auth.env,
			organizationId: auth.organizationId,
			listId,
			name: input.name,
			kind: input.kind,
			resetPurchased: input.resetPurchased,
			clientKey: input.clientKey,
		});
		return { list };
	} catch (error) {
		return handleApiError(error);
	}
}

export async function handleSupplyArchive(auth: AuthSlice, listId: string) {
	try {
		await assertSupplyMultiListsEnabled(auth.env, auth.flagContext);
		const list = await archiveSupplyList(
			auth.env.DB,
			auth.organizationId,
			listId,
		);
		return { list };
	} catch (error) {
		return handleApiError(error);
	}
}

export async function handleSupplyResetPurchased(
	auth: AuthSlice,
	listId: string,
) {
	try {
		await assertSupplyMultiListsEnabled(auth.env, auth.flagContext);
		const list = await resetPurchasedSupplyItems(
			auth.env.DB,
			auth.organizationId,
			listId,
		);
		return { list };
	} catch (error) {
		return handleApiError(error);
	}
}

export async function handleSupplyCopyToLive(
	auth: AuthSlice,
	listId: string,
	body: unknown,
) {
	try {
		await assertSupplyMultiListsEnabled(auth.env, auth.flagContext);
		const input = SupplyCopyToLiveSchema.parse(body ?? {});
		const list = await copyItemsToLive({
			env: auth.env,
			organizationId: auth.organizationId,
			sourceListId: listId,
			mode: input.mode,
			itemIds: input.itemIds,
		});
		return { list };
	} catch (error) {
		return handleApiError(error);
	}
}

export async function handleSupplyTransfer(
	auth: AuthSlice,
	listId: string,
	body: unknown,
) {
	try {
		await assertSupplyMultiListsEnabled(auth.env, auth.flagContext);
		const input = SupplyItemsTransferSchema.parse(body);
		const result = await transferSupplyItems({
			env: auth.env,
			organizationId: auth.organizationId,
			sourceListId: listId,
			targetListId: input.targetListId,
			itemIds: input.itemIds,
			mode: input.mode,
		});
		return result;
	} catch (error) {
		return handleApiError(error);
	}
}

export async function handleSupplyBulkAdd(
	auth: AuthSlice,
	listId: string,
	body: unknown,
) {
	try {
		const rate = await checkRateLimit(
			auth.env.RATION_KV,
			"grocery_mutation",
			auth.userId,
		);
		if (!rate.allowed) {
			throw rateLimitResponse(
				rate,
				"Too many requests. Please try again later.",
			);
		}
		const input = SupplyBulkAddSchema.parse(body);
		const items = parseSupplyQuickAdd(input.text);
		if (items.length === 0) {
			throw data(
				{
					error: "No items found. Separate names with commas or new lines.",
				},
				{ status: 400 },
			);
		}
		await resolveSupplyListTarget({
			env: auth.env,
			organizationId: auth.organizationId,
			listId,
			flagContext: auth.flagContext,
			allowedStates: ["live", "saved"],
		});
		return await addSupplyItemsBulk(
			auth.env.DB,
			auth.organizationId,
			listId,
			items,
		);
	} catch (error) {
		return handleApiError(error);
	}
}

export async function handleSupplyFromReceipt(auth: AuthSlice, body: unknown) {
	try {
		await assertSupplyMultiListsEnabled(auth.env, auth.flagContext);
		const input = SupplyFromReceiptSchema.parse(body);
		if (input.listId) {
			const counts = await addSupplyItemsBulk(
				auth.env.DB,
				auth.organizationId,
				input.listId,
				input.items,
			);
			const list = await getSupplyListById(
				auth.env.DB,
				auth.organizationId,
				input.listId,
			);
			return { list, ...counts };
		}
		if (!input.name) {
			throw data(
				{ error: "Choose an existing list or a name for a new one" },
				{ status: 400 },
			);
		}
		const list = await createSupplyListFromReceipt({
			env: auth.env,
			organizationId: auth.organizationId,
			scanRequestId: input.scanRequestId,
			name: input.name,
			items: input.items,
			clientKey: input.clientKey,
		});
		return { list };
	} catch (error) {
		return handleApiError(error);
	}
}

export async function handleSupplyOperations(
	auth: AuthSlice,
	listId: string,
	body: unknown,
) {
	try {
		await assertSupplyMultiListsEnabled(auth.env, auth.flagContext);
		const input = SupplyOperationsBatchSchema.parse(body);
		return await applySupplyOperations({
			env: auth.env,
			organizationId: auth.organizationId,
			listId,
			baseRevision: input.baseRevision,
			operations: input.operations,
		});
	} catch (error) {
		return handleApiError(error);
	}
}
