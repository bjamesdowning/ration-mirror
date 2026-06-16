/** Delete all R2 objects under a prefix (paginated list + batch delete). */
export async function deleteR2Prefix(
	bucket: R2Bucket,
	prefix: string,
): Promise<void> {
	let cursor: string | undefined;
	do {
		const list = await bucket.list({ prefix, cursor });
		if (list.objects.length > 0) {
			await bucket.delete(list.objects.map((obj) => obj.key));
		}
		cursor = list.truncated ? list.cursor : undefined;
	} while (cursor);
}
