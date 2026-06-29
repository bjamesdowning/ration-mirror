// Keep in sync with package.json on every release bump.
export const APP_VERSION = "1.3.34";

/** MCP worker SDK identity + `get_context` — always equals APP_VERSION; bump via package.json only. */
export const MCP_SERVER_VERSION = APP_VERSION;
