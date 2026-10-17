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

const authClientImpl = createAuthClient({
	baseURL,
	plugins: [organizationClient(), magicLinkClient()],
});

// Plugin methods take different bodies. The real client is checked at construction.
// biome-ignore lint/suspicious/noExplicitAny: Better Auth client methods are not one signature
type LooseFn = (...args: any[]) => any;

type ListedOrganization = {
	id: string;
	name: string;
	slug?: string | null;
	logo?: string | null;
	credits?: number;
};

/**
 * Better Auth 1.7's inferred client cannot be emitted (TS2742). Construction
 * above stays checked. This surface is the methods the app actually calls.
 */
export type RationAuthClient = {
	useSession: () => {
		data: {
			session: { activeOrganizationId?: string | null };
			user: {
				id: string;
				name: string;
				email: string;
				image?: string | null;
			};
		} | null;
		isPending: boolean;
	};
	useListOrganizations: () => {
		data: ListedOrganization[] | null;
		isPending: boolean;
		refetch: () => Promise<unknown>;
	};
	organization: {
		setActive: LooseFn;
		create: LooseFn;
	};
	signIn: {
		email: LooseFn;
		magicLink: LooseFn;
		social: LooseFn;
	};
	signUp: {
		email: LooseFn;
	};
	signOut: LooseFn;
	updateUser: LooseFn;
};

export const authClient = authClientImpl as RationAuthClient;
