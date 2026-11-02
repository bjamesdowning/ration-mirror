/**
 * MCP Registry HTTP domain verification (`/.well-known/mcp-registry-auth`).
 *
 * The proof record is `v=MCPv1; k=ed25519; p=<base64 public key>`. Only the
 * PUBLIC key is served. It is read from the `MCP_REGISTRY_AUTH` Worker var so
 * nothing key-related is committed; the private key never leaves the
 * publisher's machine. See docs/mcp/registry-publishing.md.
 */
const PROOF_PATTERN = /^v=MCPv1; k=(ed25519|ecdsap384); p=[A-Za-z0-9+/]+={0,2}$/;

export function getMcpRegistryAuthRecord(
	env: Partial<Record<string, unknown>> | undefined,
): string | null {
	const raw = env?.MCP_REGISTRY_AUTH;
	if (typeof raw !== "string") return null;
	const record = raw.trim();
	return PROOF_PATTERN.test(record) ? record : null;
}
