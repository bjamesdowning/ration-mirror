interface TagFilterDropdownProps {
	label: string;
	emptyLabel: string;
	currentTag?: string;
	availableTags: string[];
	onTagChange: (tag: string) => void;
}

export function TagFilterDropdown({
	label,
	emptyLabel,
	currentTag,
	availableTags,
	onTagChange,
}: TagFilterDropdownProps) {
	return (
		<div>
			<h4 className="text-sm font-medium text-muted mb-3">{label}</h4>
			<select
				value={currentTag || ""}
				onChange={(e) => onTagChange(e.target.value)}
				className="w-full bg-platinum dark:bg-white/10 border border-carbon/10 dark:border-white/10 px-4 py-3 rounded-xl text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
			>
				<option value="">{emptyLabel}</option>
				{availableTags.map((tag) => (
					<option key={tag} value={tag}>
						{tag.charAt(0).toUpperCase() + tag.slice(1)}
					</option>
				))}
			</select>
		</div>
	);
}
