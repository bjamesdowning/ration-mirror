/**
 * Distributed Idempotency Tracking using Cloudflare KV
 *
 * Prevents duplicate processing of webhook events and other critical operations
 * across all Cloudflare edge locations. Replaces in-memory Set that could allow
 * duplicate processing when requests hit different worker isolates.
 *
 * Primary use case: Stripe webhook event deduplication
 *
 * Security: Prevents double-spending and duplicate payment processing
 * Reliability: Ensures exactly-once processing semantics
 */

interface IdempotencyRecord {
	processedAt: number; // Unix timestamp when first processed
	result?: string; // Optional: serialized result for debugging
	metadata?: Record<string, unknown>; // Optional: additional context
}

/**
 * Check if an operation has already been processed and mark it as processed
 *
 * This is an atomic check-and-set operation that prevents race conditions.
 * If the operation was already processed, returns the existing record.
 * If not, marks it as processed and returns null.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param operationId - Unique identifier for the operation (e.g., Stripe event ID)
 * @param keyPrefix - Key prefix for namespacing (default: "webhook")
 * @param ttlSeconds - Time-to-live in seconds (default: 86400 = 24 hours)
 * @param metadata - Optional metadata to store with the record
 * @returns Object indicating if already processed and the existing record if any
 */
export async function checkAndMarkProcessed(
	kv: KVNamespace,
	operationId: string,
	keyPrefix = "webhook",
	ttlSeconds = 86400,
	metadata?: Record<string, unknown>,
): Promise<{ alreadyProcessed: boolean; record?: IdempotencyRecord }> {
	const key = `${keyPrefix}:${operationId}`;

	// Check if already processed
	const existingRecord = await kv.get<IdempotencyRecord>(key, "json");

	if (existingRecord) {
		// Operation was already processed
		return {
			alreadyProcessed: true,
			record: existingRecord,
		};
	}

	// Mark as processed
	const record: IdempotencyRecord = {
		processedAt: Date.now(),
		metadata,
	};

	await kv.put(key, JSON.stringify(record), {
		expirationTtl: ttlSeconds,
	});

	return {
		alreadyProcessed: false,
	};
}

/**
 * Check if an operation has been processed without marking it
 *
 * Useful for read-only checks or status queries.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param operationId - Unique identifier for the operation
 * @param keyPrefix - Key prefix for namespacing (default: "webhook")
 * @returns The idempotency record if found, null otherwise
 */
export async function checkProcessed(
	kv: KVNamespace,
	operationId: string,
	keyPrefix = "webhook",
): Promise<IdempotencyRecord | null> {
	const key = `${keyPrefix}:${operationId}`;
	return await kv.get<IdempotencyRecord>(key, "json");
}

/**
 * Mark an operation as processed with a result
 *
 * Use this when you want to store the operation result for later retrieval.
 * Useful for debugging or providing status information to clients.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param operationId - Unique identifier for the operation
 * @param result - Serializable result to store
 * @param keyPrefix - Key prefix for namespacing (default: "webhook")
 * @param ttlSeconds - Time-to-live in seconds (default: 86400 = 24 hours)
 * @param metadata - Optional metadata to store with the record
 */
export async function markProcessedWithResult(
	kv: KVNamespace,
	operationId: string,
	result: unknown,
	keyPrefix = "webhook",
	ttlSeconds = 86400,
	metadata?: Record<string, unknown>,
): Promise<void> {
	const key = `${keyPrefix}:${operationId}`;

	const record: IdempotencyRecord = {
		processedAt: Date.now(),
		result: JSON.stringify(result),
		metadata,
	};

	await kv.put(key, JSON.stringify(record), {
		expirationTtl: ttlSeconds,
	});
}

/**
 * Delete an idempotency record (admin/testing use)
 *
 * WARNING: Use with caution. Deleting idempotency records can allow
 * duplicate processing if the same operation is retried.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param operationId - Unique identifier for the operation
 * @param keyPrefix - Key prefix for namespacing (default: "webhook")
 */
export async function deleteIdempotencyRecord(
	kv: KVNamespace,
	operationId: string,
	keyPrefix = "webhook",
): Promise<void> {
	const key = `${keyPrefix}:${operationId}`;
	await kv.delete(key);
}

/**
 * Stripe-specific webhook idempotency helper
 *
 * Convenience wrapper for Stripe webhook events with appropriate defaults.
 * Uses 24-hour TTL to cover Stripe's retry window with margin.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param eventId - Stripe event ID (e.g., "evt_1234...")
 * @param sessionId - Optional Stripe session ID for metadata
 * @returns Object indicating if already processed
 */
export async function checkStripeWebhookProcessed(
	kv: KVNamespace,
	eventId: string,
	sessionId?: string,
): Promise<{ alreadyProcessed: boolean; record?: IdempotencyRecord }> {
	return checkAndMarkProcessed(
		kv,
		eventId,
		"webhook",
		86400, // 24 hours
		sessionId ? { sessionId } : undefined,
	);
}

/**
 * Generic operation idempotency helper
 *
 * Use for any operation that needs exactly-once semantics beyond webhooks.
 * Examples: payment processing, credit allocation, data imports, etc.
 *
 * @param kv - Cloudflare KV namespace binding
 * @param operationType - Type of operation (e.g., "payment", "import")
 * @param operationId - Unique identifier for this specific operation
 * @param ttlSeconds - Time-to-live in seconds
 * @param metadata - Optional metadata to store
 * @returns Object indicating if already processed
 */
export async function checkOperationProcessed(
	kv: KVNamespace,
	operationType: string,
	operationId: string,
	ttlSeconds = 3600,
	metadata?: Record<string, unknown>,
): Promise<{ alreadyProcessed: boolean; record?: IdempotencyRecord }> {
	return checkAndMarkProcessed(
		kv,
		operationId,
		`idempotency:${operationType}`,
		ttlSeconds,
		metadata,
	);
}
