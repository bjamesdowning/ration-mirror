# Publishing Ration MCP to the official MCP Registry

Manifest: [`mcp-registry/server.json`](../../mcp-registry/server.json). **Do not publish without Billy's explicit OK.**

## What gets published

- **Name:** `com.mayutic.ration/mcp`, the reverse-DNS form of `ration.mayutic.com`, proven by HTTP domain verification.
- **Remote:** `https://mcp.ration.mayutic.com/mcp` (streamable HTTP). Auth is OAuth 2.1 with Dynamic Client Registration, discovered by clients at `https://mcp.ration.mayutic.com/.well-known/oauth-protected-resource`. Users never paste API keys or bearer tokens.
- **Consistency:** `version` must equal `package.json` / `MCP_SERVER_VERSION` (the value in `/.well-known/mcp/server-card.json`); `title`, remote URL and transport match the server card. `app/lib/__tests__/mcp-registry-auth.test.ts` enforces name, URL and version. Bump `server.json` `version` with every release bump.

## Where the key lives

- **Private key (`key.pem`):** only on the publisher's machine, ideally in a password manager (e.g. 1Password item "Ration MCP Registry key"). Never commit it, never put it in Cloudflare secrets, chat, or CI logs. `*.pem` must not be added to the repo.
- **Public proof record:** served by the `ration` Worker at `https://ration.mayutic.com/.well-known/mcp-registry-auth` from the `MCP_REGISTRY_AUTH` Worker variable (`app/routes/well-known.mcp-registry-auth.ts`). The route 404s until the variable is set and rejects anything not shaped like `v=MCPv1; k=ed25519; p=…`. It is public data, but it is set out-of-band so the repo carries no key material.
- **Registry session token:** `mcp-publisher login` stores a short-lived token in `~/.mcp_publisher_token` locally. Don't commit or share it.

## Steps (Billy, after approval)

Requires OpenSSL 3+ (on macOS use Homebrew `openssl@3`, not system LibreSSL).

```bash
# 1. Install the publisher CLI
brew install mcp-publisher   # or download from github.com/modelcontextprotocol/registry/releases

# 2. Generate an Ed25519 key pair (keep key.pem private, outside the repo)
openssl genpkey -algorithm Ed25519 -out ~/.ration/mcp-registry-key.pem
PUBLIC_KEY="$(openssl pkey -in ~/.ration/mcp-registry-key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "v=MCPv1; k=ed25519; p=${PUBLIC_KEY}"

# 3. Serve the proof record from the ration Worker (public key only)
npx wrangler secret put MCP_REGISTRY_AUTH --name ration   # paste the v=MCPv1… line
curl -s https://ration.mayutic.com/.well-known/mcp-registry-auth   # must print the same line

# 4. Log in with HTTP domain verification
PRIVATE_KEY="$(openssl pkey -in ~/.ration/mcp-registry-key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
mcp-publisher login http --domain ration.mayutic.com --private-key "${PRIVATE_KEY}"

# 5. Publish from the repo root's manifest folder
cd mcp-registry && mcp-publisher publish

# 6. Verify
curl -s "https://registry.modelcontextprotocol.io/v0.1/servers?search=com.mayutic.ration/mcp"
```

`wrangler secret put` is used (rather than a committed `vars` entry) so the value lives only in Cloudflare; a secret binding is read the same way as a var.

## Updating a listing

Bump `version` in `server.json` (in sync with the app), re-run steps 4 and 5. Keep the same key pair; rotating it means updating `MCP_REGISTRY_AUTH` first.
