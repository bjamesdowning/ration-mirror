import type { SupplyListState } from "./supply-list-kinds";

export class SupplyListNotFoundError extends Error {
	override name = "SupplyListNotFoundError" as const;
	constructor(message = "Supply list not found") {
		super(message);
	}
}

export class InvalidListStateError extends Error {
	override name = "InvalidListStateError" as const;
	state: SupplyListState;
	constructor(state: SupplyListState, message?: string) {
		super(message ?? `This action is not available for a ${state} list.`);
		this.state = state;
	}
}

export class SupplyItemLimitError extends Error {
	override name = "SupplyItemLimitError" as const;
	limit: number;
	constructor(limit: number) {
		super(`This list cannot hold more than ${limit} items.`);
		this.limit = limit;
	}
}
