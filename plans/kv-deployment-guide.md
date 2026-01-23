# Cloudflare KV Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Cloudflare KV distributed state implementation for the Ration application.

---

## Prerequisites

- Wrangler CLI installed (`npm install -g wrangler`)
- Cloudflare account with Workers access
- Access to the Ration project repository
- Appropriate permissions to create KV namespaces

---

## Deployment Steps

### Step 1: Create KV Namespaces

Create both production and preview KV namespaces:

```bash
# Create production namespace
wrangler kv namespace create "RATION_KV"

# Create preview namespace for local development
wrangler kv namespace create "RATION_KV" --preview
```

**Expected Output:**
```
🌀 Creating namespace with title "ration-RATION_KV"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "RATION_KV", id = "abc123..." }
```

**Important:** Save both namespace IDs from the output.

### Step 2: Update wrangler.jsonc

Replace the placeholder IDs in [`wrangler.jsonc`](../wrangler.jsonc) with the actual namespace IDs:

```jsonc
"kv_namespaces": [
  {
    "binding": "KV",
    "id": "YOUR_PRODUCTION_NAMESPACE_ID",
    "preview_id": "YOUR_PREVIEW_NAMESPACE_ID"
  }
]
```

### Step 3: Verify Type Definitions

Ensure [`worker-configuration.d.ts`](../worker-configuration.d.ts) includes the KV binding:

```typescript
interface Env {
  KV: KVNamespace;
  // ... other bindings
}
```

### Step 4: Local Testing

Test the implementation locally before deploying:

```bash
# Start local development server
npm run dev

# Or with Wrangler directly
wrangler dev
```

**Test Checklist:**
- [ ] Checkout rate limiting works (10 requests/minute)
- [ ] Scan rate limiting works (20 requests/minute)
- [ ] Search rate limiting works (30 requests/10 seconds)
- [ ] Webhook idempotency prevents duplicate processing
- [ ] Rate limit headers are returned correctly

### Step 5: Deploy to Production

```bash
# Build and deploy
npm run deploy

# Or with Wrangler directly
npm run build && wrangler deploy build/server/index.js
```

### Step 6: Verify Production Deployment

1. **Test Rate Limiting:**
   ```bash
   # Test checkout endpoint (should rate limit after 10 requests)
   for i in {1..15}; do
     curl -X POST https://ration.mayutic.com/api/checkout \
       -H "Cookie: your-session-cookie" \
       -d "pack=SMALL"
     echo "Request $i"
   done
   ```

2. **Monitor KV Usage:**
   ```bash
   # View KV namespace metrics
   wrangler kv namespace list
   ```

3. **Check Logs:**
   ```bash
   # Tail production logs
   wrangler tail
   ```

---

## Monitoring & Maintenance

### KV Metrics Dashboard

Access KV metrics in the Cloudflare dashboard:
1. Navigate to Workers & Pages
2. Select your worker
3. Go to KV tab
4. View read/write operations and storage usage

### Expected KV Usage (1,000 DAU)

| Metric | Daily | Monthly |
|--------|-------|---------|
| Reads | ~151,000 | ~4.5M |
| Writes | ~60,500 | ~1.8M |
| Storage | <1 MB | <1 MB |
| Cost | ~$0.15 | ~$4.60 |

### Troubleshooting

#### Rate Limits Not Working

**Symptom:** Users can exceed rate limits

**Diagnosis:**
```bash
# Check if KV binding is available
wrangler kv namespace list

# Verify KV keys are being created
wrangler kv key list --namespace-id=YOUR_NAMESPACE_ID
```

**Solution:**
- Verify KV namespace IDs in wrangler.jsonc
- Check that `context.cloudflare.env.KV` is accessible
- Review worker logs for KV errors

#### Webhook Idempotency Not Working

**Symptom:** Duplicate payment processing

**Diagnosis:**
```bash
# Check for webhook event keys in KV
wrangler kv key list --namespace-id=YOUR_NAMESPACE_ID --prefix="webhook:"
```

**Solution:**
- Verify Stripe webhook signature validation is working
- Check KV write operations in logs
- Ensure 24-hour TTL is set correctly

#### High KV Costs

**Symptom:** Unexpected KV charges

**Diagnosis:**
- Review KV metrics in Cloudflare dashboard
- Check for excessive read/write operations

**Solution:**
- Verify TTLs are set correctly (prevents unbounded growth)
- Check for rate limit abuse (implement IP-based limits if needed)
- Consider caching frequently accessed data

---

## Rollback Plan

If issues arise, you can rollback to the previous version:

### Option 1: Redeploy Previous Version

```bash
# Checkout previous commit
git checkout <previous-commit-hash>

# Deploy
npm run deploy
```

### Option 2: Disable KV (Emergency)

If KV is causing critical issues, you can temporarily disable it:

1. Comment out KV binding in [`wrangler.jsonc`](../wrangler.jsonc)
2. Revert rate limiting changes in API routes
3. Deploy emergency fix

**Note:** This will revert to in-memory rate limiting with its security limitations.

---

## Security Considerations

### KV Access Control

- KV namespaces are isolated per worker
- No cross-worker access by default
- Bindings are environment-specific (production vs. preview)

### Data Retention

- Rate limit data: Auto-expires via TTL (60-300 seconds)
- Webhook idempotency: Auto-expires after 24 hours
- No manual cleanup required

### Secrets Management

- KV does not store secrets
- All sensitive data remains in environment variables
- KV only stores ephemeral state data

---

## Performance Optimization

### KV Read Performance

- Average latency: 10-50ms
- Cached at edge locations
- Eventual consistency (acceptable for rate limiting)

### Reducing KV Operations

1. **Batch Operations:** Not applicable for rate limiting (per-request)
2. **TTL Optimization:** Already optimized (60s-24h based on use case)
3. **Key Design:** Prefix-based keys enable efficient querying

---

## Future Enhancements

### Session Caching (Recommended Next Step)

Implement session caching to reduce D1 load:

```typescript
// app/lib/session-cache.server.ts
export async function getCachedSession(
  kv: KVNamespace,
  sessionToken: string
): Promise<Session | null> {
  const cached = await kv.get<Session>(`session:cache:${sessionToken}`, "json");
  if (cached) return cached;
  
  // Fetch from D1 and cache
  const session = await fetchSessionFromDB(sessionToken);
  if (session) {
    await kv.put(`session:cache:${sessionToken}`, JSON.stringify(session), {
      expirationTtl: 300 // 5 minutes
    });
  }
  return session;
}
```

### Feature Flags

Implement feature flags for gradual rollouts:

```typescript
// app/lib/feature-flags.server.ts
export async function isFeatureEnabled(
  kv: KVNamespace,
  featureName: string,
  userId?: string
): Promise<boolean> {
  const flag = await kv.get<FeatureFlag>(`feature:${featureName}`, "json");
  if (!flag) return false;
  
  // Check allowlist
  if (flag.allowlist && userId && flag.allowlist.includes(userId)) {
    return true;
  }
  
  // Check percentage rollout
  if (flag.percentage && userId) {
    const hash = hashUserId(userId);
    return hash % 100 < flag.percentage;
  }
  
  return flag.enabled;
}
```

---

## Support & Resources

- [Cloudflare KV Documentation](https://developers.cloudflare.com/kv/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [Rate Limiting Best Practices](https://developers.cloudflare.com/workers/examples/rate-limiting/)
- [Architectural Plan](./kv-distributed-state-architecture.md)

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-23 | 1.0.0 | Initial KV implementation with rate limiting and webhook idempotency |
