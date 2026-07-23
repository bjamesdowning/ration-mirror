/**
 * Default wall-clock budget for a single MCP/Copilot tool handler.
 * Prevents hung Workers AI / D1 calls from stalling the agent turn forever.
 * @see https://github.com/modelcontextprotocol/docs/blob/main/docs/concepts/tools.mdx
 */
export const MCP_TOOL_TIMEOUT_MS = 20_000;

/** Max classified rows returned in preview_inventory_import (summary-first). */
export const INVENTORY_IMPORT_PREVIEW_SAMPLE_ROWS = 10;

/** Copilot client: end turn if no stream frame while active (ms). */
export const COPILOT_TURN_WATCHDOG_MS = 90_000;
