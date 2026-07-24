import type { OrganizationMetadata } from "~/lib/types";

/**
 * Personal home group — created at signup (`personal-${userId}`, metadata.isPersonal).
 * Must not be deleted via standalone group delete; account purge may still remove it.
 *
 * Detection is intentionally narrow: metadata flag or exact signup slug only.
 * Do not match arbitrary `personal-*` slugs (users may name groups that way).
 */
export function isPersonalOrganization(
	org: {
		slug?: string | null;
		metadata?: OrganizationMetadata | null;
	},
	ownerUserId?: string | null,
): boolean {
	if (org.metadata?.isPersonal === true) return true;
	if (ownerUserId && org.slug === `personal-${ownerUserId}`) return true;
	return false;
}

export const PERSONAL_GROUP_DELETE_MESSAGE =
	"Your personal group can't be deleted. To remove all your data, delete your account instead.";

export const PERSONAL_GROUP_LEAVE_MESSAGE =
	"You can't leave your personal group. Delete your account to remove it.";
