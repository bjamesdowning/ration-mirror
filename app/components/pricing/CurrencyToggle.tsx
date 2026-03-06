import type { DisplayCurrency } from "~/lib/currency";

export function CurrencyToggle({
	value,
	onChange,
}: {
	value: DisplayCurrency;
	onChange: (next: DisplayCurrency) => void;
}) {
	return (
		<fieldset className="flex items-center rounded-lg overflow-hidden border border-platinum dark:border-white/10 shrink-0 m-0 p-0">
			<legend className="sr-only">Display currency</legend>
			<button
				type="button"
				onClick={() => onChange("EUR")}
				aria-pressed={value === "EUR"}
				aria-label="Euros"
				className={`px-3 py-1.5 text-sm font-medium transition-colors ${
					value === "EUR"
						? "bg-hyper-green text-carbon"
						: "bg-platinum/50 dark:bg-white/5 text-muted hover:bg-platinum dark:hover:bg-white/10"
				}`}
			>
				EUR
			</button>
			<button
				type="button"
				onClick={() => onChange("USD")}
				aria-pressed={value === "USD"}
				aria-label="US Dollars"
				className={`px-3 py-1.5 text-sm font-medium transition-colors ${
					value === "USD"
						? "bg-hyper-green text-carbon"
						: "bg-platinum/50 dark:bg-white/5 text-muted hover:bg-platinum dark:hover:bg-white/10"
				}`}
			>
				USD
			</button>
		</fieldset>
	);
}
