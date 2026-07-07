# Ration Copilot AI Search

Ration Copilot uses Cloudflare AI Search as managed retrieval. The application does not build or tune embeddings, chunking, indexes, BM25, or reranking in code; the copilot worker only calls the `AI_SEARCH` namespace binding with `instance_ids`.

## Instances

- `ration-docs`: R2-backed instance for `docs/fin` and future support docs.
- `ration-blog`: website crawler instance for the public blog domain.

Create them once:

```sh
wrangler ai-search create ration-docs --type r2 --source ration-copilot-docs
wrangler ai-search create ration-blog --type web-crawler --source ration.mayutic.com/blog
```

After docs/blog changes, run the manual GitLab `ai_search_sync` job. It uploads `docs/fin` and `content/blog` Markdown to the `ration-copilot-docs` R2 source bucket and triggers managed reindexing:

```sh
wrangler ai-search jobs create ration-docs
wrangler ai-search jobs create ration-blog
```

Verify indexing before enabling `ration-copilot`:

```sh
wrangler ai-search stats ration-docs
wrangler ai-search stats ration-blog
wrangler ai-search search ration-docs --query "How do I connect an agent?"
```

The worker binds the default namespace via `wrangler.copilot.jsonc`:

```jsonc
"ai_search_namespaces": [
  { "binding": "AI_SEARCH", "namespace": "default" }
]
```
