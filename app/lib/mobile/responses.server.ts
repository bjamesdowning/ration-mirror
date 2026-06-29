import { data } from "react-router";

export function paginatedResponse<T>(items: T[], nextCursor: string | null) {
	return { items, nextCursor };
}

export function throwMobileJsonError(
	message: string,
	status: number,
	code?: string,
): never {
	throw data({ error: message, code }, { status });
}
