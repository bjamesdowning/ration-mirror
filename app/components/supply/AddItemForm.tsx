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
					className="flex-1 bg-black border border-[#39FF14]/50 p-3 font-mono text-[#39FF14] placeholder-[#39FF14]/30 focus:outline-none focus:border-[#39FF14] uppercase"
					disabled={isPending}
				/>
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className={`px-3 border border-[#39FF14]/50 text-[#39FF14] hover:bg-[#39FF14]/10 transition-colors ${
						expanded ? "bg-[#39FF14]/20" : ""
					}`}
					title="More options"
				>
					<svg
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
					className="px-6 bg-[#39FF14] text-black font-bold uppercase tracking-wider hover:bg-[#2bff00] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
				>
					{isPending ? "..." : "+ ADD"}
				</button>
			</div>

			{/* Expanded options */}
			{expanded && (
				<div className="flex gap-4 p-3 border border-[#39FF14]/30 bg-[#051105]/50">
					<div className="flex-1">
						<label className="block text-xs uppercase opacity-70 mb-1">
							Quantity
						</label>
						<input
							type="number"
							value={quantity}
							onChange={(e) => setQuantity(Number(e.target.value))}
							min={1}
							className="w-full bg-black border border-[#39FF14]/50 p-2 font-mono text-[#39FF14] focus:outline-none focus:border-[#39FF14]"
						/>
					</div>
					<div className="flex-1">
						<label className="block text-xs uppercase opacity-70 mb-1">
							Unit
						</label>
						<input
							type="text"
							value={unit}
							onChange={(e) => setUnit(e.target.value)}
							placeholder="kg, ml, pcs..."
							className="w-full bg-black border border-[#39FF14]/50 p-2 font-mono text-[#39FF14] placeholder-[#39FF14]/30 focus:outline-none focus:border-[#39FF14]"
						/>
					</div>
					<div className="flex-1">
						<label className="block text-xs uppercase opacity-70 mb-1">
							Category
						</label>
						<select
							value={category}
							onChange={(e) => setCategory(e.target.value)}
							className="w-full bg-black border border-[#39FF14]/50 p-2 font-mono text-[#39FF14] focus:outline-none focus:border-[#39FF14] cursor-pointer"
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
