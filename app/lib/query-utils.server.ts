const SQLITE_SAFE_VARIABLE_LIMIT = 500;

export async function chunkedQuery<T, TId extends string = string>(
	ids: TId[],
	queryFn: (chunk: TId[]) => Promise<T[]>,
	chunkSize = SQLITE_SAFE_VARIABLE_LIMIT,
): Promise<T[]> {
	if (ids.length <= chunkSize) {
		return queryFn(ids);
	}

	const results: T[] = [];
	for (let i = 0; i < ids.length; i += chunkSize) {
		const chunk = ids.slice(i, i + chunkSize);
		results.push(...(await queryFn(chunk)));
	}

	return results;
}
