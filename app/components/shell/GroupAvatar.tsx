import type { ReactNode } from "react";

export interface GroupAvatarProps {
	/** Organization or group name (for initials fallback) */
	name: string;
	/** Organization ID (for deterministic color) */
	orgId: string;
	/** Custom logo URL when set; falls back to initials */
	image?: string | null;
	size?: "sm" | "md";
	className?: string;
}

const SIZE_CLASSES: Record<"sm" | "md", string> = {
	sm: "w-9 h-9 text-xs",
	md: "w-10 h-10 text-sm",
};

/** Orbital palette colors for group avatar backgrounds */
const ORG_COLORS = [
	"bg-hyper-green/20 text-hyper-green",
	"bg-hyper-green/40 text-carbon",
	"bg-carbon/10 text-carbon",
	"bg-platinum text-carbon",
] as const;

/**
 * Get initials from group name: first letter of first two words, or first 2–3 chars for single-word.
 * "Billy James Downing" → "BJ"; "Family" → "Fa"
 */
export function getOrgInitials(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return "?";
	const words = trimmed.split(/\s+/).filter(Boolean);
	if (words.length >= 2) {
		const a = words[0]?.charAt(0) ?? "";
		const b = words[1]?.charAt(0) ?? "";
		return (a + b).toUpperCase() || "?";
	}
	// Single word: first 2 chars, or 1 if very short
	return trimmed.length >= 2
		? trimmed.slice(0, 2).toUpperCase()
		: trimmed.charAt(0).toUpperCase();
}

/**
 * Deterministic color class from org ID hash (Orbital palette)
 */
export function getOrgColorClass(orgId: string): (typeof ORG_COLORS)[number] {
	let hash = 0;
	for (let i = 0; i < orgId.length; i++) {
		hash = (hash << 5) - hash + orgId.charCodeAt(i);
		hash = hash & hash; // eslint-disable-line no-bitwise
	}
	const index = Math.abs(hash) % ORG_COLORS.length;
	const color = ORG_COLORS[index];
	return color ?? ORG_COLORS[0];
}

export function GroupAvatar({
	name,
	orgId,
	image,
	size = "sm",
	className = "",
}: GroupAvatarProps): ReactNode {
	const sizeClasses = SIZE_CLASSES[size];
	const imageUrl = image?.trim();

	if (imageUrl) {
		return (
			<img
				src={imageUrl}
				alt={name}
				className={`${sizeClasses} rounded-full border border-platinum object-cover shadow-sm ${className}`.trim()}
			/>
		);
	}

	const initials = getOrgInitials(name);
	const colorClass = getOrgColorClass(orgId);

	return (
		<div
			className={`${sizeClasses} rounded-full flex items-center justify-center font-bold shrink-0 ${colorClass} ${className}`.trim()}
			title={name}
		>
			{initials}
		</div>
	);
}
