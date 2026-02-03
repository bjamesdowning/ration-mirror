import { useState } from "react";
import { useFetcher } from "react-router";

interface AddItemFormProps {
	listId: string;
	onAdd?: () => void;
}

const CATEGORY_OPTIONS = [
	{ value: "other", label: "Other" },
	{ value: "produce", label: "Produce" },
	{ value: "perishable", label: "Refrigerated" },
	{ value: "cryo_frozen", label: "Frozen" },
	{ value: "dry_goods", label: "Dry Goods" },
	{ value: "canned", label: "Canned" },
	{ value: "liquid", label: "Beverages" },
];

export function AddItemForm({ listId, onAdd }: AddItemFormProps) {
	const fetcher = useFetcher();
	const [name, setName] = useState("");
	const [quantity, setQuantity] = useState(1);
	const [unit, setUnit] = useState("unit");
	const [category, setCategory] = useState("other");
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
				category,
			}),
			{
				method: "POST",
				action: `/api/grocery-lists/${listId}/items`,
				encType: "application/json",
			},
		);

		// Reset form
		setName("");
		setQuantity(1);
		setUnit("unit");
		setCategory("other");
		setExpanded(false);
		onAdd?.();
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-3">
			{/* Main input row */}
			<div className="flex gap-2">
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Add item to list..."
					className="flex-1 bg-white rounded-lg px-4 py-3 text-carbon placeholder-muted border-0 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
					disabled={isPending}
				/>
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className={`px-3 rounded-lg text-carbon hover:bg-platinum/80 transition-colors ${
						expanded ? "bg-platinum" : "bg-platinum/50"
					}`}
					title="More options"
				>
					<svg
						aria-hidden="true"
						className={`w-5 h-5 transition-transform ${expanded ? "rotate-180" : ""}`}
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</button>
				<button
					type="submit"
					disabled={isPending || !name.trim()}
					className="px-4 py-3 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all"
				>
					{isPending ? "..." : "+ Add to Supply"}
				</button>
			</div>

			{/* Expanded options */}
			{expanded && (
				<div className="flex gap-4 p-4 bg-platinum/50 rounded-xl">
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
							value={quantity}
							onChange={(e) => setQuantity(Number(e.target.value))}
							min={1}
							className="w-full bg-white rounded-lg px-4 py-2 text-carbon border-0 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>
					<div className="flex-1">
						<label htmlFor="unit" className="block text-label text-muted mb-1">
							Unit
						</label>
						<input
							id="unit"
							type="text"
							value={unit}
							onChange={(e) => setUnit(e.target.value)}
							placeholder="kg, ml, pcs..."
							className="w-full bg-white rounded-lg px-4 py-2 text-carbon placeholder-muted border-0 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>
					<div className="flex-1">
						<label
							htmlFor="category"
							className="block text-label text-muted mb-1"
						>
							Category
						</label>
						<select
							id="category"
							value={category}
							onChange={(e) => setCategory(e.target.value)}
							className="w-full bg-white rounded-lg px-4 py-2 text-carbon border-0 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none cursor-pointer"
						>
							{CATEGORY_OPTIONS.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
					</div>
				</div>
			)}
		</form>
	);
}
