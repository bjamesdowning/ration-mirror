import { useState } from "react";
import { useFetcher } from "react-router";
import { DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";

interface AddItemFormProps {
	listId: string;
	onAdd?: () => void;
	defaultDomain?: (typeof ITEM_DOMAINS)[number];
}

export function AddItemForm({
	listId,
	onAdd,
	defaultDomain = "food",
}: AddItemFormProps) {
	const fetcher = useFetcher();
	const [name, setName] = useState("");
	const [quantity, setQuantity] = useState(1);
	const [unit, setUnit] = useState("unit");
	const [domain, setDomain] =
		useState<(typeof ITEM_DOMAINS)[number]>(defaultDomain);
	const [expanded, setExpanded] = useState(false);

	const isPending = fetcher.state !== "idle";

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (!name.trim()) return;

		fetcher.submit(
			JSON.stringify({
				name: name.trim(),
				quantity,
				unit,
				domain,
			}),
			{
				method: "POST",
				action: `/api/supply-lists/${listId}/items`,
				encType: "application/json",
			},
		);

		// Reset form
		setName("");
		setQuantity(1);
		setUnit("unit");
		setDomain(defaultDomain);
		setExpanded(false);
		onAdd?.();
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="flex flex-col gap-4">
				{/* Name input */}
				<div className="flex flex-col">
					<label
						htmlFor="supply-item-name"
						className="text-label text-muted mb-2"
					>
						Item Name
					</label>
					<input
						id="supply-item-name"
						type="text"
						inputMode="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Add item to list..."
						className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						disabled={isPending}
					/>
				</div>

				{/* Expand toggle */}
				<div>
					<button
						type="button"
						onClick={() => setExpanded(!expanded)}
						className="flex items-center text-xs text-muted hover:text-carbon font-medium transition-colors"
					>
						{expanded ? (
							<>
								<span className="mr-1">−</span> Less Details
							</>
						) : (
							<>
								<span className="mr-1">+</span> Add Details (Qty, Domain)
							</>
						)}
					</button>
				</div>

				{/* Expanded options */}
				{expanded && (
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-platinum/50 rounded-xl">
						<div className="flex-1">
							<label
								htmlFor="quantity"
								className="block text-label text-muted mb-1"
							>
								Quantity
							</label>
							<input
								id="quantity"
								type="number"
								inputMode="decimal"
								value={quantity}
								onChange={(e) => setQuantity(Number(e.target.value))}
								min={1}
								className="w-full bg-platinum rounded-lg px-4 py-2 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							/>
						</div>
						<div className="flex-1">
							<label
								htmlFor="unit"
								className="block text-label text-muted mb-1"
							>
								Unit
							</label>
							<input
								id="unit"
								type="text"
								inputMode="text"
								value={unit}
								onChange={(e) => setUnit(e.target.value)}
								placeholder="kg, ml, pcs..."
								className="w-full bg-platinum rounded-lg px-4 py-2 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							/>
						</div>
						<div className="flex-1">
							<label
								htmlFor="domain"
								className="block text-label text-muted mb-1"
							>
								Domain
							</label>
							<select
								id="domain"
								value={domain}
								onChange={(e) =>
									setDomain(e.target.value as (typeof ITEM_DOMAINS)[number])
								}
								className="w-full bg-platinum rounded-lg px-4 py-2 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none cursor-pointer"
							>
								{ITEM_DOMAINS.map((itemDomain) => (
									<option key={itemDomain} value={itemDomain}>
										{DOMAIN_LABELS[itemDomain]}
									</option>
								))}
							</select>
						</div>
					</div>
				)}
			</div>

			<button
				type="submit"
				disabled={isPending || !name.trim()}
				className="w-full px-4 py-3 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all"
			>
				{isPending ? "..." : "Add to Supply"}
			</button>
		</form>
	);
}
