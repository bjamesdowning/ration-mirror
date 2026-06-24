interface SupplyItemCheckboxProps {
	optimisticPurchased: boolean;
	isPending: boolean;
	onClick: () => void;
}

export function SupplyItemCheckbox({
	optimisticPurchased,
	isPending,
	onClick,
}: SupplyItemCheckboxProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isPending}
			className="min-w-[44px] min-h-[44px] flex-shrink-0 flex items-center justify-center disabled:opacity-50"
			aria-label={
				optimisticPurchased ? "Mark as not purchased" : "Mark as purchased"
			}
		>
			<span
				className={`w-5 h-5 flex items-center justify-center rounded-md border-2 transition-all ${
					optimisticPurchased
						? "border-hyper-green bg-hyper-green text-carbon"
						: "border-muted hover:border-hyper-green"
				}`}
			>
				{optimisticPurchased && (
					<svg
						aria-hidden="true"
						className="w-3 h-3"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={3}
							d="M5 13l4 4L19 7"
						/>
					</svg>
				)}
			</span>
		</button>
	);
}
