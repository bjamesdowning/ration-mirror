/**
 * Extended types for Better Auth with Ration customizations
 */

import type { Session, User } from "better-auth";

// User settings stored in user.settings JSON field
export interface UserSettings {
  unitSystem?: "metric" | "imperial";
  expirationAlertDays?: number;
  listGeneration?: {
    lastGeneratedAt?: string;
    enabled?: boolean;
    frequency?: "off" | "daily" | "weekly" | "biweekly" | "custom";
    intervalDays?: number;
  };
}

// Extended organization type with credits and metadata
export interface OrganizationWithCredits {
	id: string;
	name: string;
	slug: string | null;
	logo: string | null;
	credits: number;
	metadata: {
		isPersonal?: boolean;
	} | null;
	createdAt: Date;
}

// Extended session with active organization
export interface SessionWithActiveOrg extends Session {
	activeOrganizationId: string | null;
}

// Complete authenticated session with user
export interface AuthSession {
	session: SessionWithActiveOrg;
	user: User;
}

// Member with user information
export interface MemberWithUser {
	id: string;
	organizationId: string;
	userId: string;
	role: "owner" | "admin" | "member";
	createdAt: Date;
	user: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	};
}

// Invitation with organization and inviter details
export interface InvitationWithDetails {
	id: string;
	organizationId: string;
	token: string;
	role: "admin" | "member";
	status: "pending" | "accepted" | "canceled";
	expiresAt: Date;
	inviterId: string;
	createdAt: Date;
	organization: {
		id: string;
		name: string;
	};
	inviter: {
		id: string;
		name: string;
		email: string;
	};
}

// Ledger entry with user info
export interface LedgerEntry {
	id: string;
	organizationId: string;
	userId: string | null;
	amount: number;
	reason: string;
	createdAt: Date;
	user?: {
		id: string;
		name: string;
	} | null;
}
