# Ration Copilot AI Search

Ration Copilot uses Cloudflare AI Search as managed retrieval. The application does not build or tune embeddings, chunking, indexes, BM25, or reranking in code; the copilot worker only calls the `AI_SEARCH` namespace binding with `instance_ids`.

## Instances

- `ration-docs`: R2-backed instance for **all** copilot knowledge. Both
  `docs/fin` (support docs) and `content/blog` (blog posts) are uploaded to the
  `ration-copilot-docs` bucket, so this single instance covers everything. The
  copilot queries only this instance (see `COPILOT_AI_SEARCH_INSTANCES` in
  `app/lib/copilot/tools.server.ts`).

Create it once:

```sh
wrangler ai-search create ration-docs --type r2 --source ration-copilot-docs
```

`search_docs` uses `Promise.allSettled` across `COPILOT_AI_SEARCH_INSTANCES`, so
adding a second instance (e.g. a web-crawler `ration-blog`) is a one-line change
and a single failing instance never takes the tool down.

After docs/blog changes, run the manual GitLab `ai_search_sync` job. It uploads `docs/fin` and `content/blog` Markdown to the `ration-copilot-docs` R2 source bucket and triggers managed reindexing.

To upload from a local machine (must use `--remote` or objects land in Miniflare only):

```sh
for file in $(find docs/fin content/blog -type f \( -name '*.md' -o -name '*.mdx' \)); do
  wrangler r2 object put "ration-copilot-docs/${file}" --file "$file" --remote
done
wrangler ai-search jobs create ration-docs
wrangler ai-search jobs create ration-blog
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
