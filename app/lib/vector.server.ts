import type { InventoryItemInput } from "./inventory.server";

export interface VectorizeMetadata {
	organizationId: string;
	itemId: string;
	name: string;
	tags: string[];
}

/**
 * Generate a vector embedding for a given text using Cloudflare Workers AI.
 * Model: @cf/baai/bge-base-en-v1.5 (768 dimensions)
 */
export async function generateEmbedding(
	env: Env,
	text: string,
): Promise<number[]> {
	const response = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
		text: [text],
	});

	// The response format for embeddings can vary slightly, but typically it's { data: [[...]] } or just [[...]]
	// bge-base-en-v1.5 typically returns { options: ..., data: [[...]] } or { shape: ..., data: [[...]] }
	// Let's being robust.
	if (
		"data" in response &&
		Array.isArray(response.data) &&
		Array.isArray(response.data[0])
	) {
		return response.data[0];
	}

	// Fallback if the shape is different (some models return just the array)
	if (Array.isArray(response) && Array.isArray(response[0])) {
		return response[0] as number[];
	}

	throw new Error("Unexpected response format from AI model");
}

/**
 * Update (or insert) the embedding for an inventory item.
 * Constructs a semantic string from name and tags.
 */
export async function updateItemEmbedding(
	env: Env,
	organizationId: string,
	itemId: string,
	item: InventoryItemInput,
) {
	const semanticText = `${item.name} ${item.tags.join(" ")} ${item.unit}`;

	try {
		const embedding = await generateEmbedding(env, semanticText);

		await env.VECTOR_INDEX.upsert([
			{
				id: itemId,
				values: embedding,
				metadata: {
					organizationId,
					itemId,
					name: item.name,
					tags: JSON.stringify(item.tags), // Metadata only supports strings/numbers/booleans
				},
			},
		]);
		console.log(`[Vector] Upserted embedding for item: ${itemId}`);
	} catch (error) {
		console.error(
			`[Vector] Failed to update embedding for item: ${itemId}`,
			error,
		);
		// We do not throw here to avoid failing the main transaction if vector sync fails.
		// In a production system, this should likely go to a queue for retry.
	}
}

/**
 * Search for similar items in the vector database.
 * Filters by organizationId to ensure multi-tenant isolation.
 */
export async function querySimilarItems(
	env: Env,
	organizationId: string,
	query: string,
	topK = 5,
) {
	const embedding = await generateEmbedding(env, query);

	const results = await env.VECTOR_INDEX.query(embedding, {
		topK,
		filter: {
			organizationId: organizationId,
		},
	});

	return results.matches;
}
