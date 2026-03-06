import {
	magicLinkClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// In dev, fall back to current origin when VITE_BETTER_AUTH_URL is not set.
// Ensures auth works with bun run dev / dev:remote without .env
const baseURL =
	import.meta.env.VITE_BETTER_AUTH_URL ??
	(typeof window !== "undefined" ? window.location.origin : undefined);

export const authClient = createAuthClient({
	baseURL,
	plugins: [organizationClient(), magicLinkClient()],
});
