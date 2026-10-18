#!/usr/bin/env bash
# Match Cloudflare Workers Builds before a push.
# Install is bun 1.4.3 with a frozen lockfile from an empty node_modules.
# Deploy commands are the dashboard commands, with wrangler told not to upload.
# Each bundle must start in Miniflare and answer one request.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if ! grep -q '"deploy": "bun run build && wrangler deploy build/server/index.js"' package.json; then
	echo "workers-builds-gate: package.json deploy script drifted from the ration Worker" >&2
	exit 1
fi
if ! grep -q '"deploy:mcp": "wrangler deploy --config wrangler.mcp.jsonc --env='"'"''"'"'"' package.json; then
	echo "workers-builds-gate: package.json deploy:mcp script drifted from the ration-mcp Worker" >&2
	exit 1
fi
if ! grep -q '"deploy:copilot": "wrangler deploy --config wrangler.copilot.jsonc --env='"'"''"'"'"' package.json; then
	echo "workers-builds-gate: package.json deploy:copilot script drifted from the ration-copilot Worker" >&2
	exit 1
fi

echo "workers-builds-gate: rm -rf node_modules && bunx bun@1.4.3 install --frozen-lockfile"
rm -rf node_modules
bunx bun@1.4.3 install --frozen-lockfile

out_root="${TMPDIR:-/tmp}/ration-workers-builds-gate"
rm -rf "$out_root"
mkdir -p "$out_root/app" "$out_root/mcp" "$out_root/copilot"

# ration — build command `bun run build`, deploy command `bun run deploy`
# (`bun run build && wrangler deploy build/server/index.js`). The deploy
# command repeats that build; one build plus the wrangler half is the same
# work, and --dry-run stops the upload.
echo "workers-builds-gate: ration build"
bun run build
echo "workers-builds-gate: ration deploy dry-run"
./node_modules/.bin/wrangler deploy build/server/index.js \
	--dry-run \
	--outdir "$out_root/app"
node scripts/workers-builds-miniflare.mjs \
	ration \
	"$out_root/app" \
	wrangler.jsonc \
	"https://ration.mayutic.com/"

# ration-mcp — no build command, deploy command `bun run deploy:mcp`
echo "workers-builds-gate: ration-mcp deploy dry-run"
./node_modules/.bin/wrangler deploy \
	--config wrangler.mcp.jsonc \
	--env='' \
	--dry-run \
	--outdir "$out_root/mcp"
node scripts/workers-builds-miniflare.mjs \
	ration-mcp \
	"$out_root/mcp" \
	wrangler.mcp.jsonc \
	"https://mcp.ration.mayutic.com/"

# ration-copilot — no build command, deploy command `bun run deploy:copilot`
echo "workers-builds-gate: ration-copilot deploy dry-run"
./node_modules/.bin/wrangler deploy \
	--config wrangler.copilot.jsonc \
	--env='' \
	--dry-run \
	--outdir "$out_root/copilot"
node scripts/workers-builds-miniflare.mjs \
	ration-copilot \
	"$out_root/copilot" \
	wrangler.copilot.jsonc \
	"https://copilot.ration.mayutic.com/"

echo "workers-builds-gate: all three workers started"
