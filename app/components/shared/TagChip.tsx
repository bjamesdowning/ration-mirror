import { sanitizeTagColor, type TagRecord } from "~/lib/tags";

type TagChipTag = Pick<TagRecord, "slug" | "name"> & {
	color?: string | null;
};

interface TagChipProps {
	tag: TagChipTag;
	onClick?: (slug: string) => void;
	active?: boolean;
	size?: "sm" | "md";
}

export function TagChip({
	tag,
	onClick,
	active = false,
	size = "md",
}: TagChipProps) {
	const padding = size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-xs";
	const safeColor = sanitizeTagColor(tag.color);
	const style = safeColor
		? { backgroundColor: `${safeColor}20`, color: safeColor }
		: undefined;

	const className = [
		"rounded-md font-medium transition-colors",
		padding,
		onClick ? "cursor-pointer hover:opacity-80" : "",
		!safeColor
			? active
				? "bg-hyper-green text-carbon"
				: "bg-hyper-green/10 text-hyper-green"
			: "",
	]
		.filter(Boolean)
		.join(" ");

	if (onClick) {
		return (
			<button
				type="button"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onClick(tag.slug);
				}}
				className={className}
				style={style}
				title={tag.slug}
			>
				{tag.name}
			</button>
		);
	}

	return (
		<span className={className} style={style} title={tag.slug}>
			{tag.name}
		</span>
	);
}
