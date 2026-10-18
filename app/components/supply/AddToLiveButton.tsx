export function AddToLiveButton({
	name,
	state,
	pending,
	onClick,
}: {
	name: string;
	state: "none" | "on_live" | "in_cart";
	pending?: boolean;
	onClick?: () => void;
}) {
	const marked = state === "on_live" || state === "in_cart";
	return (
		<button
			type={marked ? "button" : "submit"}
			disabled={pending && !marked}
			data-testid="add-to-live"
			className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold ${
				state === "on_live"
					? "bg-hyper-green text-on-hyper-green"
					: "border border-platinum text-carbon"
			}`}
			onClick={onClick}
			aria-label={
				state === "on_live"
					? `${name} is on Live`
					: state === "in_cart"
						? `${name} is in the cart`
						: `Add ${name} to Live`
			}
		>
			{marked ? "✓" : "+"}
		</button>
	);
}
