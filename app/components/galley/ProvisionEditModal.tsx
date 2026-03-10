import { useEffect, useState } from "react";
import { type useFetcher, useRevalidator } from "react-router";
import type { meal } from "~/db/schema";
import { DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import { SUPPORTED_UNITS } from "~/lib/units";

interface ProvisionEditModalProps {
	meal: typeof meal.$inferSelect & {
		tags?: string[];
		ingredients?: { ingredientName: string; quantity: number; unit: string }[];
	};
	onClose: () => void;
	fetcher: ReturnType<
		typeof useFetcher<{ provision?: unknown; error?: string }>
	>;
}

export function ProvisionEditModal({
	meal,
	onClose,
	fetcher,
}: ProvisionEditModalProps) {
	const revalidator = useRevalidator();
	const [name, setName] = useState(meal.name);
	const [quantity, setQuantity] = useState(
		meal.ingredients?.[0]?.quantity ?? 1,
	);
	const [unit, setUnit] = useState(meal.ingredients?.[0]?.unit ?? "unit");
	const [domain, setDomain] = useState(meal.domain ?? "food");
	const [tagsStr, setTagsStr] = useState((meal.tags ?? []).join(", "));

	const isSubmitting = fetcher.state !== "idle";

	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data?.provision) {
			revalidator.revalidate();
			onClose();
		}
	}, [fetcher.state, fetcher.data, onClose, revalidator]);

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
				method: "PATCH",
				action: `/api/provisions/${meal.id}`,
				encType: "application/json",
			},
		);
	};

	return (
		<div className="fixed inset-0 bg-carbon/30 backdrop-blur-sm flex items-end md:items-center md:justify-center z-[80] p-0 md:p-4">
			<div className="bg-ceramic rounded-t-2xl md:rounded-2xl shadow-xl p-6 w-full md:max-w-md max-h-[90vh] overflow-y-auto safe-area-pb">
				<div className="flex justify-between items-center mb-6">
					<h2 className="text-xl font-bold text-carbon">Edit Item</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-muted hover:text-carbon text-2xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
						aria-label="Close"
					>
						×
					</button>
				</div>

				{fetcher.data?.error && (
					<div className="bg-danger/10 text-danger px-4 py-3 rounded-xl mb-4 text-sm">
						{fetcher.data.error}
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label
							htmlFor="provision-name"
							className="block text-sm font-medium text-muted mb-1"
						>
							Name
						</label>
						<input
							id="provision-name"
							type="text"
							inputMode="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div>
							<label
								htmlFor="provision-quantity"
								className="block text-sm font-medium text-muted mb-1"
							>
								Quantity
							</label>
							<input
								id="provision-quantity"
								type="number"
								inputMode="decimal"
								min="0.01"
								step="any"
								value={quantity}
								onChange={(e) => setQuantity(Number(e.target.value) || 0)}
								required
								className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
							/>
						</div>
						<div>
							<label
								htmlFor="provision-unit"
								className="block text-sm font-medium text-muted mb-1"
							>
								Unit
							</label>
							<select
								id="provision-unit"
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
							htmlFor="provision-domain"
							className="block text-sm font-medium text-muted mb-1"
						>
							Domain
						</label>
						<select
							id="provision-domain"
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
							htmlFor="provision-tags"
							className="block text-sm font-medium text-muted mb-1"
						>
							Tags (comma-separated)
						</label>
						<input
							id="provision-tags"
							type="text"
							inputMode="text"
							value={tagsStr}
							onChange={(e) => setTagsStr(e.target.value)}
							placeholder="e.g. snack, staple"
							className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>

					<div className="flex gap-3 pt-2">
						<button
							type="button"
							onClick={onClose}
							className="flex-1 py-2.5 rounded-xl font-medium border border-platinum text-carbon hover:bg-platinum/50 transition-colors"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isSubmitting}
							className="flex-1 py-3 bg-hyper-green text-carbon font-semibold rounded-xl shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-50"
						>
							{isSubmitting ? "Saving…" : "Save"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
