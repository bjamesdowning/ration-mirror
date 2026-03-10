import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import { SUPPORTED_UNITS } from "~/lib/units";

interface ProvisionQuickAddProps {
	onSuccess?: () => void;
	onUpgradeRequired?: () => void;
	/** Pre-select domain (e.g. from current filter) */
	defaultDomain?: string;
}

export function ProvisionQuickAdd({
	onSuccess,
	onUpgradeRequired,
	defaultDomain = "food",
}: ProvisionQuickAddProps) {
	const fetcher = useFetcher<{
		provision?: unknown;
		error?: string;
	}>();
	const revalidator = useRevalidator();
	const nameRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState("");
	const [quantity, setQuantity] = useState(1);
	const [unit, setUnit] = useState("unit");
	const [domain, setDomain] = useState(defaultDomain);
	const [tagsStr, setTagsStr] = useState("");

	const isSubmitting = fetcher.state !== "idle";

	useEffect(() => {
		nameRef.current?.focus();
	}, []);

	useEffect(() => {
		if (fetcher.state !== "idle" || !fetcher.data) return;
		if (fetcher.data.error === "capacity_exceeded") {
			onUpgradeRequired?.();
			return;
		}
		if (fetcher.data.provision) {
			setName("");
			setQuantity(1);
			setUnit("unit");
			setTagsStr("");
			revalidator.revalidate();
			onSuccess?.();
		}
	}, [fetcher.state, fetcher.data, onSuccess, onUpgradeRequired, revalidator]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const tags = tagsStr
			.split(",")
			.map((t) => t.trim().toLowerCase())
			.filter(Boolean);
		fetcher.submit(
			JSON.stringify({
				name: name.trim().toLowerCase(),
				quantity: Number(quantity) || 1,
				unit: unit || "unit",
				domain: domain || "food",
				tags,
			}),
			{
				method: "POST",
				action: "/api/provisions",
				encType: "application/json",
			},
		);
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div>
				<label
					htmlFor="provision-quick-name"
					className="block text-label text-muted mb-2 text-sm"
				>
					Item name
				</label>
				<input
					ref={nameRef}
					id="provision-quick-name"
					type="text"
					inputMode="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
					placeholder="e.g. bananas, dish soap"
					className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
				/>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div>
					<label
						htmlFor="provision-quick-quantity"
						className="block text-label text-muted mb-2 text-sm"
					>
						Quantity
					</label>
					<input
						id="provision-quick-quantity"
						type="number"
						inputMode="decimal"
						min="0.01"
						step="any"
						value={quantity}
						onChange={(e) => setQuantity(Number(e.target.value) || 0)}
						className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
					/>
				</div>
				<div>
					<label
						htmlFor="provision-quick-unit"
						className="block text-label text-muted mb-2 text-sm"
					>
						Unit
					</label>
					<select
						id="provision-quick-unit"
						value={unit}
						onChange={(e) => setUnit(e.target.value)}
						className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
					>
						{SUPPORTED_UNITS.map((u) => (
							<option key={u} value={u}>
								{u}
							</option>
						))}
					</select>
				</div>
			</div>

			<div>
				<label
					htmlFor="provision-quick-domain"
					className="block text-label text-muted mb-2 text-sm"
				>
					Domain
				</label>
				<select
					id="provision-quick-domain"
					value={domain}
					onChange={(e) => setDomain(e.target.value)}
					className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
				>
					{ITEM_DOMAINS.map((d) => (
						<option key={d} value={d}>
							{DOMAIN_LABELS[d]}
						</option>
					))}
				</select>
			</div>

			<div>
				<label
					htmlFor="provision-quick-tags"
					className="block text-label text-muted mb-2 text-sm"
				>
					Tags (optional, comma-separated)
				</label>
				<input
					id="provision-quick-tags"
					type="text"
					inputMode="text"
					value={tagsStr}
					onChange={(e) => setTagsStr(e.target.value)}
					placeholder="e.g. snack, staple"
					className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
				/>
			</div>

			{fetcher.data?.error && fetcher.data.error !== "capacity_exceeded" && (
				<div className="bg-danger/10 text-danger text-sm px-4 py-2 rounded-lg">
					{fetcher.data.error}
				</div>
			)}

			<div className="flex justify-end">
				<button
					type="submit"
					disabled={isSubmitting}
					className="bg-hyper-green text-carbon font-bold px-6 py-3 rounded-lg shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-50"
				>
					{isSubmitting ? "Adding…" : "Add Item"}
				</button>
			</div>
		</form>
	);
}
