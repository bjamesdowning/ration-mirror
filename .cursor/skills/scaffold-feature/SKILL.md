---
name: scaffold-feature
description: Step-by-step guide for scaffolding a new feature: creating route files, components, server utilities, Zod schemas, and wiring into routes.ts. Use when adding new features or routes to the application.
---

# Scaffold New Feature

This skill provides a systematic approach to adding a new feature to Ration, following the established patterns and architecture.

## When to Use

Use this skill when:
- Adding a new route/page to the application
- Creating a new feature module (e.g., new dashboard section)
- Adding API endpoints for a new resource

## Step-by-Step Process

### 1. Plan the Feature

- Identify the route path (e.g., `/dashboard/new-feature`)
- Determine if it needs API endpoints (`/api/new-feature`)
- List required components
- Define data model (if new tables needed)

### 2. Create Route File

Create the route file following React Router v7 patterns:

**For page routes:** `app/routes/dashboard/new-feature.tsx`
```typescript
import type { Route } from "./+types/new-feature";
import { requireActiveGroup } from "~/lib/auth.server";
import { getFeatureData } from "~/lib/new-feature.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { groupId } = await requireActiveGroup(context, request);
  const data = await getFeatureData(context.cloudflare.env.DB, groupId);
  return { data };
}

export default function NewFeature({ loaderData }: Route.ComponentProps) {
  const { data } = loaderData;
  // Component implementation
}
```

**For API routes:** `app/routes/api/new-feature.ts`
```typescript
import type { Route } from "./+types/new-feature";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { NewFeatureSchema } from "~/lib/schemas/new-feature";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { groupId } = await requireActiveGroup(context, request);
  // Fetch logic
}

export async function action({ request, context }: Route.ActionArgs) {
  const { groupId } = await requireActiveGroup(context, request);
  if (request.method !== "POST") {
    throw new Response("Method not allowed", { status: 405 });
  }
  try {
    const json = await request.json();
    const input = NewFeatureSchema.parse(json);
    // Process logic
    return { success: true };
  } catch (e) {
    return handleApiError(e);
  }
}
```

### 3. Create Zod Schema

Create validation schema in `app/lib/schemas/new-feature.ts`:

```typescript
import { z } from "zod";

export const NewFeatureSchema = z.object({
  name: z.string().min(1),
  // Add other fields
});

export type NewFeatureInput = z.infer<typeof NewFeatureSchema>;
```

### 4. Create Server Utility

Create server-side logic in `app/lib/new-feature.server.ts`:

```typescript
import { drizzle } from "drizzle-orm/cloudflare-d1";
import { NewFeatureSchema } from "~/lib/schemas/new-feature";

export async function getFeatureData(
  db: D1Database,
  organizationId: string,
) {
  const d1 = drizzle(db);
  // Query logic
}

export async function createFeature(
  db: D1Database,
  organizationId: string,
  input: z.infer<typeof NewFeatureSchema>,
) {
  const d1 = drizzle(db);
  // Create logic
}
```

### 5. Create Components

Create feature-specific components in `app/components/new-feature/`:

- Follow atomic design principles
- Use TypeScript interfaces for props
- Reference `app/components/common/StandardCard.tsx` for card patterns
- Use `useFetcher` for mutations

### 6. Update routes.ts

Add the route to `app/routes.ts`:

```typescript
import { route } from "./routes/dashboard/new-feature";

export const routes = [
  // ... existing routes
  route("/dashboard/new-feature", "./routes/dashboard/new-feature.tsx"),
];
```

### 7. Database Schema (if needed)

If new tables are required:

1. Add schema to `app/db/schema.ts`
2. Run `bun run db:generate` to create migration
3. Run `bun run db:migrate:dev` to apply locally
4. Test before committing

### 8. Testing

- Add tests in `app/**/*.test.ts` or `app/**/*.test.tsx`
- Test loader/action functions
- Test component rendering

## Reference Examples

- **Route with loader:** `app/routes/dashboard/index.tsx`
- **API route:** `app/routes/api/meals.ts`
- **Component:** `app/components/galley/MealCard.tsx`
- **Server utility:** `app/lib/meals.server.ts`
- **Schema:** `app/lib/schemas/meal.ts`

## Checklist

- [ ] Route file created with loader/action
- [ ] Zod schema created and validated
- [ ] Server utility functions created
- [ ] Components created in feature directory
- [ ] Route added to `routes.ts`
- [ ] Database schema updated (if needed)
- [ ] Migrations generated and applied
- [ ] Tests written
- [ ] Code passes lint and typecheck
