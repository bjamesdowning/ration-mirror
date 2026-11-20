# Ration Copilot AI Search

Ration Copilot uses Cloudflare AI Search as managed retrieval. The application does not build or tune embeddings, chunking, indexes, BM25, or reranking in code; the copilot worker only calls the `AI_SEARCH` namespace binding with `instance_ids`.

## Instances

- `ration-docs`: R2-backed instance for **all** copilot knowledge. Sources are uploaded to the `ration-copilot-docs` bucket under stable object keys that match repo paths (or `README.md` at the bucket root). The copilot queries only this instance (see `COPILOT_AI_SEARCH_INSTANCES` in `app/lib/copilot/tools.server.ts`).

### Indexed corpus

| Path | Role |
|------|------|
| `docs/fin/**` | Product how-to SoT (also rendered at `/help`) |
| `content/blog/**` | Blog posts |
| `docs/dev/**` | Engineering / ops notes (Flagship, this doc) |
| `docs/legal/**` | Terms and Privacy (also rendered at `/legal/*`) |
| `docs/mcp/**` | MCP developer reference (`README.md`, source of truth for MCP tool names and behaviour) and `registry-publishing.md`. Included once the CI sync-sources MR lands. |
| `README.md` | Engineering SoT (root README) |

Create the instance once:

```sh
wrangler ai-search create ration-docs --type r2 --source ration-copilot-docs
```

`search_docs` uses `Promise.allSettled` across `COPILOT_AI_SEARCH_INSTANCES`, so adding a second instance (e.g. a web-crawler) is a one-line change and a single failing instance never takes the tool down.

## Syncing the corpus (hand-run, Billy's call)

The sync is a **hand-run operator script**, not a CI job you can trigger. `.gitlab-ci.yml` still holds an `ai_search_sync` job as the canonical copy of the script, but it never runs:

- The `workflow` rules only create **merge-request pipelines** (`$CI_PIPELINE_SOURCE == "merge_request_event"`). A push to `main` creates no pipeline.
- The `ai_search_sync` job's rule is `when: never` for merge-request pipelines, so it is left out of the only pipelines that exist.

So there is no button under Build → Pipelines to press. The sync runs **only when Billy asks for it**, from a machine with Cloudflare credentials that have R2 and AI Search write access. Merging docs does not re-sync them: an MR that changes indexed content should say "AI-search re-sync needed after merge" and leave the run to Billy.

The script uploads the corpus to the `ration-copilot-docs` R2 source bucket and triggers managed reindexing via `wrangler ai-search jobs create` (**requires Wrangler ≥ 4.112.0**). Run it from the repo root on an up-to-date `main` (must use `--remote` or objects land in Miniflare only). Keep the `find` list in step with the `ai_search_sync` job:

```sh
for file in $(find docs/fin content/blog docs/dev docs/legal docs/mcp -type f \( -name '*.md' -o -name '*.mdx' \)); do
  wrangler r2 object put "ration-copilot-docs/${file}" --file "$file" --remote
done
wrangler r2 object put "ration-copilot-docs/README.md" --file "README.md" --remote
wrangler ai-search jobs create ration-docs
```

Verify indexing before enabling `ration-copilot`:

```sh
wrangler ai-search stats ration-docs
wrangler ai-search search ration-docs --query "How do I connect an agent?"
```

The worker binds the default namespace via `wrangler.copilot.jsonc`:

```jsonc
"ai_search_namespaces": [
  { "binding": "AI_SEARCH", "namespace": "default" }
]
```
