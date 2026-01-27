import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

import {
	CameraInput,
	type DetectedItem,
} from "~/components/scanner/CameraInput";
import { formatInventoryCategory, INVENTORY_CATEGORIES } from "~/lib/inventory";

export function IngestForm() {
	const fetcher = useFetcher();
	const formRef = useRef<HTMLFormElement>(null);
	const isSubmitting = fetcher.state !== "idle";

	// State to populate form programmatically
	// We can use refs to access inputs directly without re-renders for every keystroke generally,
	// but for population we need to set values. DefaultValue only works on mount.
	// Controlled inputs would be cleaner, but let's stick to uncontrolled with Ref manipulation for "industrial" speed if possible,
	// OR just use state. Let's use Refs for direct manipulation which is often simpler for "fill form" actions without re-rendering everything.
	const nameInputRef = useRef<HTMLInputElement>(null);
	const qtyInputRef = useRef<HTMLInputElement>(null);
	const unitInputRef = useRef<HTMLSelectElement>(null);
	const categoryInputRef = useRef<HTMLSelectElement>(null);

	// Reset form on success
	useEffect(() => {
		if (
			fetcher.state === "idle" &&
			fetcher.data &&
			// biome-ignore lint/suspicious/noExplicitAny: generic fetcher data
			(fetcher.data as any).success
		) {
			formRef.current?.reset();
		}
	}, [fetcher.state, fetcher.data]);

	const handleScanComplete = (items: DetectedItem[]) => {
		if (items.length > 0) {
			const item = items[0];
			if (nameInputRef.current)
				nameInputRef.current.value = item.name.toUpperCase();
			if (qtyInputRef.current)
				qtyInputRef.current.value = item.quantity.toString();

			// Heuristic for unit or default to "unit"
			if (unitInputRef.current) unitInputRef.current.value = "unit"; // Start with default
			if (categoryInputRef.current) categoryInputRef.current.value = "other";

			// Auto-check tags if they match?
			// For MVP, simplistic name/qty fill is great "wow" factor.
		}
	};

	return (
		<div className="glass-panel rounded-xl p-6">
			<div className="flex justify-between items-center mb-6 border-b border-platinum pb-4">
				<h2 className="text-xl font-bold text-carbon">Add New Item</h2>
				<CameraInput onScanComplete={handleScanComplete} />
			</div>

			<fetcher.Form method="post" ref={formRef} className="space-y-4">
				<input type="hidden" name="intent" value="create" />

				{/* Name */}
				<div className="flex flex-col">
					<label htmlFor="item-name" className="text-label text-muted mb-2">
						Item Name
					</label>
					<input
						id="item-name"
						ref={nameInputRef}
						type="text"
						name="name"
						required
						placeholder="Enter item name"
						className="bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none placeholder-muted/50"
					/>
				</div>

				{/* Qty & Unit */}
				<div className="grid grid-cols-2 gap-4">
					<div className="flex flex-col">
						<label
							htmlFor="item-quantity"
							className="text-label text-muted mb-2"
						>
							Quantity
						</label>
						<input
							id="item-quantity"
							ref={qtyInputRef}
							type="number"
							name="quantity"
							required
							min="0"
							step="any"
							defaultValue="1"
							className="bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>
					<div className="flex flex-col">
						<label htmlFor="item-unit" className="text-label text-muted mb-2">
							Unit
						</label>
						<select
							id="item-unit"
							ref={unitInputRef}
							name="unit"
							className="bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none appearance-none"
						>
							<option value="unit">Unit</option>
							<option value="kg">kg</option>
							<option value="g">g</option>
							<option value="lb">lb</option>
							<option value="oz">oz</option>
							<option value="l">L</option>
							<option value="ml">mL</option>
							<option value="can">Can</option>
							<option value="pack">Pack</option>
						</select>
					</div>
				</div>

				{/* Category */}
				<div className="flex flex-col">
					<label htmlFor="item-category" className="text-label text-muted mb-2">
						Category
					</label>
					<select
						id="item-category"
						ref={categoryInputRef}
						name="category"
						defaultValue="other"
						className="bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none appearance-none"
					>
						{INVENTORY_CATEGORIES.map((category) => (
							<option key={category} value={category}>
								{formatInventoryCategory(category)}
							</option>
						))}
					</select>
				</div>

				{/* Tags */}
				<div className="flex flex-col">
					<label htmlFor="tag-dry" className="text-label text-muted mb-2">
						Tags
					</label>
					<div className="flex flex-wrap gap-4 text-sm">
						{["Dry", "Frozen", "Fridge", "Hazard"].map((tag) => (
							<label
								key={tag}
								className="flex items-center cursor-pointer text-carbon hover:text-hyper-green transition-colors"
							>
								<input
									type="checkbox"
									id={tag === "Dry" ? "tag-dry" : undefined}
									name="tags"
									value={tag}
									className="mr-2 w-4 h-4 accent-hyper-green rounded"
								/>
								{tag}
							</label>
						))}
					</div>
				</div>

				{/* Submit */}
				<button
					type="submit"
					disabled={isSubmitting}
					className="w-full bg-hyper-green text-carbon font-bold px-6 py-3 rounded-lg shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-50 mt-4"
				>
					{isSubmitting ? "Adding..." : "Add Item"}
				</button>
			</fetcher.Form>
		</div>
	);
}
