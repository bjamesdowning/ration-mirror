const USER_CONVERSATION_PREFIX = "copilot:user-conversation";
const ORG_CONVERSATION_PREFIX = "copilot:org-conversation";
const CONVERSATION_PREFIX = "copilot:conversation";
const AUTO_DEDUCT_PREFIX = "copilot:auto-deduct";
const ALLOWANCE_PREFIX = "copilot:allowance";

function purgeSecret(env: Env): string | undefined {
	return env.COPILOT_PURGE_SECRET ?? env.BETTER_AUTH_SECRET;
}

function decodeAgentName(agentName: string): {
	organizationId: string;
	userId: string;
	conversationId: string;
} | null {
	const [organizationId, userId, _tier, conversationId] =
		decodeURIComponent(agentName).split(":");
	if (!organizationId || !userId || !conversationId) return null;
	return { organizationId, userId, conversationId };
}

async function listConversationIndex(
	kv: KVNamespace,
	prefix: string,
): Promise<Array<{ key: string; agentName: string }>> {
	const rows: Array<{ key: string; agentName: string }> = [];
	let cursor: string | undefined;
	do {
		const page = await kv.list({ prefix, cursor });
		const values = await Promise.all(
			page.keys.map(async ({ name }) => ({
				key: name,
				agentName: await kv.get(name),
			})),
		);
		for (const row of values) {
			if (row.agentName) rows.push({ key: row.key, agentName: row.agentName });
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return rows;
}

async function purgeAgent(
	env: Env,
	namespace: DurableObjectNamespace | undefined,
	agentName: string,
): Promise<void> {
	if (!namespace) return;
	const secret = purgeSecret(env);
	if (!secret) {
		throw new Error("COPILOT_PURGE_SECRET is required for copilot purge");
	}
	const id = namespace.idFromName(agentName);
	const stub = namespace.get(id);
	await stub.fetch("https://copilot.internal/internal/purge", {
		method: "POST",
		headers: { "X-Ration-Purge-Token": secret },
	});
}

async function deleteKeysWithPrefix(
	kv: KVNamespace,
	prefix: string,
): Promise<void> {
	let cursor: string | undefined;
	do {
		const page = await kv.list({ prefix, cursor });
		await Promise.all(page.keys.map(({ name }) => kv.delete(name)));
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
}

async function purgeConversationIndexes(
	env: Env,
	prefix: string,
): Promise<void> {
	if (!env.RATION_KV) return;
	const rows = await listConversationIndex(env.RATION_KV, prefix);
	const uniqueAgentNames = new Set(rows.map((row) => row.agentName));
	for (const agentName of uniqueAgentNames) {
		await purgeAgent(env, env.PROJECT_THINK, agentName);
	}
	await Promise.all([
		...rows.map((row) => env.RATION_KV.delete(row.key)),
		...rows.flatMap((row) => {
			const identity = decodeAgentName(row.agentName);
			if (!identity) return [];
			return [
				env.RATION_KV.delete(
					`${CONVERSATION_PREFIX}:${identity.organizationId}:${identity.conversationId}`,
				),
				env.RATION_KV.delete(
					`${AUTO_DEDUCT_PREFIX}:${identity.organizationId}:${identity.userId}`,
				),
			];
		}),
	]);
}

export async function purgeCopilotConversationsForUser(
	env: Env,
	userId: string,
): Promise<void> {
	await purgeConversationIndexes(env, `${USER_CONVERSATION_PREFIX}:${userId}:`);
}

export async function purgeCopilotConversationsForOrganization(
	env: Env,
	organizationId: string,
): Promise<void> {
	await purgeConversationIndexes(
		env,
		`${ORG_CONVERSATION_PREFIX}:${organizationId}:`,
	);
	if (!env.RATION_KV) return;
	await Promise.all([
		deleteKeysWithPrefix(
			env.RATION_KV,
			`${CONVERSATION_PREFIX}:${organizationId}:`,
		),
		deleteKeysWithPrefix(
			env.RATION_KV,
			`${AUTO_DEDUCT_PREFIX}:${organizationId}:`,
		),
		env.RATION_KV.delete(`${ALLOWANCE_PREFIX}:${organizationId}`),
	]);
}
