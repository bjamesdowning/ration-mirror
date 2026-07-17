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
| `README.md` | Engineering SoT (root README) |

Create the instance once:

```sh
wrangler ai-search create ration-docs --type r2 --source ration-copilot-docs
```

`search_docs` uses `Promise.allSettled` across `COPILOT_AI_SEARCH_INSTANCES`, so adding a second instance (e.g. a web-crawler) is a one-line change and a single failing instance never takes the tool down.

After docs/blog/README/legal changes, run the manual GitLab **`ai_search_sync`** job (always available under Verify; requires Cloudflare credentials with R2 + AI Search write access). It uploads the corpus to the `ration-copilot-docs` R2 source bucket and triggers managed reindexing via `wrangler ai-search jobs create` (**requires Wrangler ≥ 4.112.0**).

To upload from a local machine (must use `--remote` or objects land in Miniflare only):

```sh
for file in $(find docs/fin content/blog docs/dev docs/legal -type f \( -name '*.md' -o -name '*.mdx' \)); do
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
