import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { GalleyManifest } from "~/lib/schemas/galley-manifest";

interface GalleyImportPreviewProps {
	manifest: GalleyManifest;
	filename: string;
	onClose: () => void;
	onSuccess: () => void;
}

export function GalleyImportPreview({
	manifest,
	filename,
	onClose,
	onSuccess,
}: GalleyImportPreviewProps) {
	const fetcher = useFetcher();
	const [selectedIds, setSelectedIds] = useState<Set<number>>(
		() => new Set(manifest.meals.map((_, i) => i)),
	);

	const selectedMeals = manifest.meals.filter((_, i) => selectedIds.has(i));
	const isSubmitting = fetcher.state !== "idle";

	const toggleSelection = (index: number) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	};

	const toggleAll = () => {
		if (selectedIds.size === manifest.meals.length) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(manifest.meals.map((_, i) => i)));
		}
	};

	const handleSubmit = () => {
		const filteredManifest: GalleyManifest = {
			...manifest,
			meals: selectedMeals,
		};
		fetcher.submit(JSON.stringify(filteredManifest), {
			method: "POST",
			action: "/api/galley/import",
			encType: "application/json",
		});
	};

	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data?.success) {
			onSuccess();
			onClose();
		}
	}, [fetcher.state, fetcher.data, onSuccess, onClose]);

	const error =
		fetcher.data && !("success" in fetcher.data) && "error" in fetcher.data
			? (fetcher.data as { error?: string }).error
			: null;

	return (
		<div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-carbon/80 backdrop-blur-sm">
			<div className="bg-ceramic dark:bg-[#1A1A1A] border-2 border-hyper-green rounded-xl shadow-glow w-full md:max-w-4xl max-h-[90vh] md:max-h-[85vh] overflow-hidden flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between p-6 border-b border-hyper-green/30">
					<div>
						<h2 className="text-2xl font-bold text-hyper-green">
							Import Galley
						</h2>
						<p className="text-sm text-muted mt-1">
							{manifest.meals.length} meal
							{manifest.meals.length !== 1 ? "s" : ""} from {filename} •{" "}
							{selectedMeals.length} selected
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="text-muted hover:text-hyper-green transition-colors"
						aria-label="Close modal"
					>
						<X className="w-6 h-6" />
					</button>
				</div>

				{/* Bulk Controls */}
				<div className="p-4 border-b border-hyper-green/30 bg-carbon/20">
					<button
						type="button"
						onClick={toggleAll}
						className="px-4 py-2 bg-platinum/10 hover:bg-platinum/20 text-sm text-muted hover:text-hyper-green rounded-lg transition-colors font-medium"
					>
						{selectedIds.size === manifest.meals.length
							? "Deselect All"
							: "Select All"}
					</button>
				</div>

				{/* Meals List */}
				<div className="flex-1 overflow-y-auto p-4 space-y-2">
					{manifest.meals.map((meal, index) => (
						<div
							key={meal.id ?? `meal-${index}`}
							className="bg-carbon/20 border border-platinum/10 rounded-lg p-4 hover:border-hyper-green/30 transition-colors"
						>
							<div className="flex items-start gap-3">
								<input
									type="checkbox"
									checked={selectedIds.has(index)}
									onChange={() => toggleSelection(index)}
									className="mt-1 w-5 h-5 accent-hyper-green rounded"
								/>
								<div className="flex-1 min-w-0">
									<h3 className="text-lg font-semibold text-carbon capitalize">
										{meal.name}
									</h3>
									<p className="text-sm text-muted">
										{meal.type === "recipe"
											? `Recipe • ${meal.domain} • ${meal.ingredients?.length ?? 0} ingredients`
											: `Provision • ${meal.domain} • ${meal.quantity} ${meal.unit}`}
									</p>
								</div>
							</div>
						</div>
					))}

					{manifest.meals.length === 0 && (
						<div className="text-center py-12 text-muted">
							No meals found in file
						</div>
					)}
				</div>

				{/* Error */}
				{error && (
					<div className="bg-danger/10 text-danger px-4 py-3 rounded-xl mx-4 mb-4 text-sm">
						{error}
					</div>
				)}

				{/* Footer Actions */}
				<div className="p-6 border-t border-hyper-green/30 flex justify-between items-center">
					<button
						type="button"
						onClick={onClose}
						className="px-6 py-3 text-muted hover:text-hyper-green font-medium transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={selectedMeals.length === 0 || isSubmitting}
						className="px-8 py-3 bg-hyper-green text-carbon font-bold rounded-lg shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
					>
						{isSubmitting ? (
							<>Importing...</>
						) : (
							<>
								<Check className="w-5 h-5" />
								Import {selectedMeals.length} Meal
								{selectedMeals.length !== 1 ? "s" : ""}
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
