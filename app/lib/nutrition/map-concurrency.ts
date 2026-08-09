/**
 * Run async work over items with a bounded concurrency pool.
 */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];
	const poolSize = Math.max(1, Math.min(limit, items.length));
	const results = new Array<R>(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await fn(items[index] as T, index);
		}
	}

	await Promise.all(Array.from({ length: poolSize }, () => worker()));
	return results;
}
