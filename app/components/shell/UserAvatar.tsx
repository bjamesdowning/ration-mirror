interface UserAvatarProps {
	name?: string | null;
	email?: string | null;
	image?: string | null;
	size?: "sm" | "md" | "lg";
	className?: string;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps["size"]>, string> = {
	sm: "w-8 h-8 text-xs",
	md: "w-12 h-12 text-lg",
	lg: "w-16 h-16 text-2xl",
};

function getFallbackInitial(name?: string | null, email?: string | null) {
	const normalizedName = name?.trim();
	if (normalizedName) {
		return normalizedName.charAt(0).toUpperCase();
	}

	const normalizedEmail = email?.trim();
	if (normalizedEmail) {
		return normalizedEmail.charAt(0).toUpperCase();
	}

	return "?";
}

function getAvatarLabel(name?: string | null, email?: string | null) {
	const normalizedName = name?.trim();
	if (normalizedName) return normalizedName;
	const normalizedEmail = email?.trim();
	if (normalizedEmail) return normalizedEmail;
	return "User";
}

export function UserAvatar({
	name,
	email,
	image,
	size = "md",
	className = "",
}: UserAvatarProps) {
	const sizeClasses = SIZE_CLASSES[size];
	const imageUrl = image?.trim();

	if (imageUrl) {
		return (
			<img
				src={imageUrl}
				alt={getAvatarLabel(name, email)}
				className={`${sizeClasses} rounded-full border-2 border-platinum object-cover shadow-sm ${className}`.trim()}
			/>
		);
	}

	return (
		<div
			className={`${sizeClasses} rounded-full bg-platinum/50 flex items-center justify-center font-bold text-muted border-2 border-platinum border-dashed ${className}`.trim()}
			title={getAvatarLabel(name, email)}
		>
			{getFallbackInitial(name, email)}
		</div>
	);
}
