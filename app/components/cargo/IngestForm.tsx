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
		<div className="border border-[#39FF14] bg-[#051105] p-4 font-mono text-[#39FF14]">
			<div className="flex justify-between items-center mb-4 border-b border-[#39FF14]/50 pb-2">
				<h2 className="text-xl font-bold uppercase">Ingest Station</h2>
				<CameraInput onScanComplete={handleScanComplete} />
			</div>

			<fetcher.Form method="post" ref={formRef} className="space-y-4">
				<input type="hidden" name="intent" value="create" />

				{/* Name */}
				<div className="flex flex-col">
					<label
						htmlFor="item-name"
						className="text-xs uppercase opacity-70 mb-1"
					>
						Item Ident
					</label>
					<input
						id="item-name"
						ref={nameInputRef}
						type="text"
						name="name"
						required
						placeholder="RATION BLOCK A"
						className="bg-black/50 border border-[#39FF14]/50 p-2 text-sm focus:border-[#39FF14] outline-none placeholder-[#39FF14]/20"
					/>
				</div>

				{/* Qty & Unit */}
				<div className="grid grid-cols-2 gap-4">
					<div className="flex flex-col">
						<label
							htmlFor="item-quantity"
							className="text-xs uppercase opacity-70 mb-1"
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
							className="bg-black/50 border border-[#39FF14]/50 p-2 text-sm focus:border-[#39FF14] outline-none"
						/>
					</div>
					<div className="flex flex-col">
						<label
							htmlFor="item-unit"
							className="text-xs uppercase opacity-70 mb-1"
						>
							Unit
						</label>
						<select
							id="item-unit"
							ref={unitInputRef}
							name="unit"
							className="bg-black/50 border border-[#39FF14]/50 p-2 text-sm focus:border-[#39FF14] outline-none appearance-none"
						>
							<option value="unit">UNIT</option>
							<option value="kg">KG</option>
							<option value="g">G</option>
							<option value="lb">LB</option>
							<option value="oz">OZ</option>
							<option value="l">L</option>
							<option value="ml">ML</option>
							<option value="can">CAN</option>
							<option value="pack">PACK</option>
						</select>
					</div>
				</div>

				{/* Category */}
				<div className="flex flex-col">
					<label
						htmlFor="item-category"
						className="text-xs uppercase opacity-70 mb-1"
					>
						Category
					</label>
					<select
						id="item-category"
						ref={categoryInputRef}
						name="category"
						defaultValue="other"
						className="bg-black/50 border border-[#39FF14]/50 p-2 text-sm focus:border-[#39FF14] outline-none appearance-none"
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
					<label
						htmlFor="tag-dry"
						className="text-xs uppercase opacity-70 mb-1"
					>
						Classification (Tags)
					</label>
					<div className="flex gap-4 text-xs">
						{["Dry", "Frozen", "Fridge", "Hazard"].map((tag) => (
							<label
								key={tag}
								className="flex items-center cursor-pointer hover:opacity-100 opacity-70"
							>
								<input
									type="checkbox"
									id={tag === "Dry" ? "tag-dry" : undefined}
									name="tags"
									value={tag}
									className="mr-2 accent-[#39FF14]"
								/>
								[{tag.toUpperCase()}]
							</label>
						))}
					</div>
				</div>

				{/* Submit */}
				<button
					type="submit"
					disabled={isSubmitting}
					className="w-full bg-[#39FF14] text-black font-bold uppercase py-2 hover:bg-[#32cc12] disabled:opacity-50 mt-4 transition-colors"
				>
					{isSubmitting ? "Ingesting..." : "Execute Ingest"}
				</button>
			</fetcher.Form>
		</div>
	);
}
