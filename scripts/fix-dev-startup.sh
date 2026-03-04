#!/usr/bin/env bash
# Fix for dev server "fetch failed / other side closed" errors.
# Run: ./scripts/fix-dev-startup.sh

set -e

echo "Stopping any orphan dev processes on common ports..."

# Kill processes on Vite dev port (5173), Node inspector (9229, 9230), and common Miniflare ports
for port in 5173 9229 9230 60632 60637; do
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "  Killing process(es) on port $port: $pids"
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  fi
done

# Kill any lingering node/bun processes that match "react-router dev" or "vite"
if command -v pkill >/dev/null 2>&1; then
  pkill -f "react-router dev" 2>/dev/null || true
  pkill -f "miniflare" 2>/dev/null || true
fi

echo ""
echo "Ports cleared. Run: bun run dev"
echo "If using remote bindings: bun run dev:remote"
