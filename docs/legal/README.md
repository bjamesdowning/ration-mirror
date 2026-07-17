# Legal documents (compliance SoT)

Markdown in this folder is the source of truth for Terms of Service and Privacy Policy.

- [`terms.md`](./terms.md) → `/legal/terms`
- [`privacy.md`](./privacy.md) → `/legal/privacy`

Routes import these files with `?raw` and render them via `LegalMarkdown`. Use HTML comment markers to preserve public anchors:

```md
<!-- section:trader-information -->
## 13. Trader Information
…
<!-- /section -->
```

The same files are uploaded to the Copilot AI Search R2 bucket (`ration-copilot-docs`). Edit here first; do not re-embed full legal prose in route TSX.
