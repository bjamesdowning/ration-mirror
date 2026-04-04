# Security overview

## Transport and browser safety

Ration is served over **HTTPS**. The app sets strict **Content Security Policy** and related headers to reduce common web risks (for example clickjacking and MIME sniffing). Payment scripts load only from trusted payment providers as configured.

## Authentication

Users sign in with **magic link email** and/or **Google OAuth** (whatever the live app exposes). Sessions are validated on each protected request **server-side**—there is no “trust the browser” shortcut for private data.

## Authorization and multi-tenancy

Data is partitioned by **organization**. Queries always anchor on the **verified session’s active organization** or a **scoped API key**—not on arbitrary IDs from the client. **Vector search** uses per-organization namespaces so semantic results cannot leak across groups.

## API keys

Programmatic keys are stored as **hashes**; you see the plaintext **once** at creation. Comparisons use **constant-time** checks to reduce timing side channels.

## Rate limiting

Sensitive endpoints (AI, search, auth, public share links, MCP) use **rate limits** backed by global counters so abuse cannot silently exhaust your bill or neighbors’ stability. Some layers **fail open** if the counter store is unavailable—availability first, with logging for operators.

## Payments

**Stripe** processes cards; Ration verifies **signed webhooks** and uses **idempotency** so duplicate events do not double-credit.

## What we do not claim here

This article is a **high-level** summary, not a certification letter. For contractual or compliance wording, use your order form, DPA, and **legal pages** on the site.

If you need SOC2/ISO specifics, ask sales or support for **official** documents—do not infer from this hub.
