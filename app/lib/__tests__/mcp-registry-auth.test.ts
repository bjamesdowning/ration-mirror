import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getMcpRegistryAuthRecord } from "../mcp-registry-auth";
import { MCP_SERVER_VERSION } from "../version";
import { loader } from "../../routes/well-known.mcp-registry-auth";

const VALID = "v=MCPv1; k=ed25519; p=MCowBQYDK2VwAyEAabcdefghijklmnopqrstuvwx+/=";

describe("mcp-registry-auth", () => {
	it("returns a valid proof record", () => {
		expect(getMcpRegistryAuthRecord({ MCP_REGISTRY_AUTH: ` ${VALID}\n` })).toBe(VALID);
	});

	it("rejects missing or malformed values", () => {
		expect(getMcpRegistryAuthRecord(undefined)).toBeNull();
		expect(getMcpRegistryAuthRecord({})).toBeNull();
		expect(getMcpRegistryAuthRecord({ MCP_REGISTRY_AUTH: "-----BEGIN PRIVATE KEY-----" })).toBeNull();
		expect(getMcpRegistryAuthRecord({ MCP_REGISTRY_AUTH: "v=MCPv1; k=rsa; p=abc" })).toBeNull();
	});

	it("route 404s when unset and serves text/plain when set", async () => {
		const missing = await loader({ context: { cloudflare: { env: {} } } });
		expect(missing.status).toBe(404);
		const ok = await loader({ context: { cloudflare: { env: { MCP_REGISTRY_AUTH: VALID } } } });
		expect(ok.status).toBe(200);
		expect(ok.headers.get("Content-Type")).toContain("text/plain");
		expect((await ok.text()).trim()).toBe(VALID);
	});
});

describe("mcp-registry/server.json", () => {
	const serverJson = JSON.parse(
		readFileSync(join(process.cwd(), "mcp-registry/server.json"), "utf8"),
	);

	it("uses the domain-verified namespace and the live MCP endpoint", () => {
		expect(serverJson.name).toBe("com.mayutic.ration/mcp");
		expect(serverJson.remotes).toEqual([
			{ type: "streamable-http", url: "https://mcp.ration.mayutic.com/mcp" },
		]);
	});

	it("stays in sync with the app / server-card version", () => {
		expect(serverJson.version).toBe(MCP_SERVER_VERSION);
	});

	it("description fits the registry's 100-char limit", () => {
		expect(serverJson.description.length).toBeLessThanOrEqual(100);
	});
});
