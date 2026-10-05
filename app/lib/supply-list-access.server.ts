import type { FlagshipEvaluationContext } from "./feature-flags/context.server";
import { ensureLiveSupplyList } from "./supply.server";
import { isSupplyMultiListsEnabled } from "./supply-list-flag.server";
import type { SupplyListState } from "./supply-list-kinds";
import {
	requireSingletonLiveListId,
	requireSupplyListTarget,
} from "./supply-list-target.server";

export async function resolveSupplyListTarget(options: {
	env: Env;
	organizationId: string;
	listId: string;
	flagContext: FlagshipEvaluationContext;
	allowedStates?: SupplyListState[];
}) {
	const multiListsEnabled = await isSupplyMultiListsEnabled(
		options.env,
		options.flagContext,
	);
	return requireSupplyListTarget(
		options.env.DB,
		options.organizationId,
		options.listId,
		{
			multiListsEnabled,
			allowedStates: options.allowedStates,
		},
	);
}

export async function requireLegacyLiveListId(options: {
	env: Env;
	organizationId: string;
	listId: string;
}) {
	const live = await ensureLiveSupplyList(
		options.env.DB,
		options.organizationId,
	);
	if (!live) throw new Error("Supply list not found");
	await requireSingletonLiveListId(
		options.env.DB,
		options.organizationId,
		options.listId,
		live.id,
	);
	return live;
}
