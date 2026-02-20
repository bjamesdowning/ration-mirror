import { AlertCircle, Check, ChefHat, Link2, Timer } from "lucide-react";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useFetcher, useNavigate } from "react-router";

interface ImportedRecipe {
	name: string;
	description?: string;
	directions?: string;
	ingredients: Array<{
		ingredientName: string;
		quantity: number;
		unit: string;
		isOptional?: boolean;
		orderIndex?: number;
	}>;
	prepTime?: number;
	cookTime?: number;
	servings?: number;
	tags?: string[];
	equipment?: string[];
	customFields?: Record<string, string>;
}

export interface ImportRecipeButtonHandle {
	open: () => void;
}

interface ImportRecipeButtonProps {
	className?: string;
}

export const ImportRecipeButton = forwardRef<
	ImportRecipeButtonHandle,
	ImportRecipeButtonProps
>(({ className }, ref) => {
	const [showModal, setShowModal] = useState(false);
	const [url, setUrl] = useState("");
	const [importedUrl, setImportedUrl] = useState<string | null>(null);
	const [view, setView] = useState<"url" | "loading" | "result" | "error">(
		"url",
	);
	const saveInFlight = useRef(false);
	const importFetcher = useFetcher<{
		success: boolean;
		recipe?: ImportedRecipe;
		error?: string;
		code?: string;
		message?: string;
	}>();
	const saveFetcher = useFetcher();
	const navigate = useNavigate();

	useImperativeHandle(ref, () => ({
		open: () => {
			setShowModal(true);
			setUrl("");
			setImportedUrl(null);
			setView("url");
		},
	}));

	const recipe = importFetcher.data?.recipe;
	const importError = importFetcher.data?.error ?? importFetcher.data?.message;

	useEffect(() => {
		if (importFetcher.state === "idle" && importFetcher.data !== undefined) {
			if (importFetcher.data?.recipe) {
				setView("result");
			} else if (importFetcher.data?.error || importFetcher.data?.message) {
				setView("error");
			}
		}
	}, [importFetcher.state, importFetcher.data]);

	const handleImport = () => {
		const trimmed = url.trim();
		if (!trimmed) return;
		setImportedUrl(trimmed);
		setView("loading");
		importFetcher.submit(JSON.stringify({ url: trimmed }), {
			method: "post",
			action: "/api/meals/import",
			encType: "application/json",
		});
	};

	const resetState = () => {
		setUrl("");
		setImportedUrl(null);
		setView("url");
	};

	const handleSave = () => {
		if (!recipe) return;
		saveInFlight.current = true;
		const mealData = [
			{
				...recipe,
				tags: [...(recipe.tags ?? []), "url-import"],
			},
		];
		saveFetcher.submit(JSON.stringify(mealData), {
			method: "post",
			action: "/hub/galley/new",
			encType: "application/json",
		});
	};

	useEffect(() => {
		if (saveFetcher.state === "idle" && saveInFlight.current) {
			saveInFlight.current = false;
			const hasError =
				saveFetcher.data &&
				typeof saveFetcher.data === "object" &&
				"error" in saveFetcher.data;
			if (!hasError) {
				setShowModal(false);
				setView("url");
				setUrl("");
				setImportedUrl(null);
				navigate("/hub/galley");
			}
		}
	}, [saveFetcher.state, saveFetcher.data, navigate]);

	const showUrlInput = view === "url";
	const showProcessing = view === "loading";
	const showError = view === "error";
	const showApproval = view === "result" && recipe;

	return (
		<>
			<button
				type="button"
				onClick={() => setShowModal(true)}
				className={`
					flex items-center gap-2 px-4 py-3 
					bg-hyper-green text-carbon font-semibold rounded-lg
					shadow-glow-sm hover:shadow-glow transition-all
					active:scale-95
					${className || ""}
				`}
			>
				<Link2 className="w-4 h-4" />
				Import URL
			</button>

			{showModal && (
				<div
					className="fixed inset-0 z-[60] flex items-center justify-center bg-carbon/80 backdrop-blur-sm animate-fade-in"
					role="dialog"
					aria-modal="true"
				>
					<button
						type="button"
						className="absolute inset-0 bg-transparent cursor-default"
						onClick={() => setShowModal(false)}
						aria-label="Close modal"
					/>

					<div className="bg-ceramic dark:bg-[#1A1A1A] border border-platinum dark:border-white/10 rounded-2xl w-full md:max-w-2xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto m-4 relative z-10 flex flex-col shadow-xl">
						<div className="p-6 border-b border-platinum dark:border-white/10 flex justify-between items-center sticky top-0 bg-ceramic/95 dark:bg-[#1A1A1A]/95 backdrop-blur z-20">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-full bg-hyper-green/20 flex items-center justify-center">
									<Link2 className="w-5 h-5 text-hyper-green" />
								</div>
								<div>
									<h3 className="text-xl font-bold text-carbon dark:text-white">
										Import Meal
									</h3>
									<p className="text-xs text-muted">
										Paste a URL to extract a meal
									</p>
								</div>
							</div>
							<button
								type="button"
								onClick={() => setShowModal(false)}
								className="p-2 text-carbon dark:text-white hover:bg-platinum dark:hover:bg-white/10 rounded-full transition-colors"
							>
								✕
							</button>
						</div>

						<div className="p-8">
							{/* Phase 1: URL Input */}
							{showUrlInput && (
								<div className="space-y-6 text-center py-12">
									<p className="text-carbon/80 dark:text-white/80 max-w-md mx-auto">
										Paste a meal URL and we'll extract it into your Galley.
									</p>
									<div className="max-w-md mx-auto text-left">
										<label
											htmlFor="import-recipe-url"
											className="block text-sm font-medium text-carbon dark:text-white mb-1"
										>
											Meal URL
										</label>
										<input
											id="import-recipe-url"
											type="url"
											value={url}
											onChange={(e) => setUrl(e.target.value)}
											placeholder="https://example.com/recipe/..."
											className="w-full px-4 py-3 rounded-lg border border-platinum dark:border-white/20 bg-white dark:bg-white/5 text-carbon dark:text-white placeholder:text-muted"
											aria-describedby="import-url-hint"
										/>
										<p id="import-url-hint" className="text-xs text-muted mt-1">
											HTTPS only. Works with most recipe sites.
										</p>
									</div>
									<button
										type="button"
										onClick={handleImport}
										disabled={!url.trim()}
										className="px-8 py-4 bg-hyper-green text-carbon font-bold rounded-xl shadow-glow hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
									>
										Import Meal
									</button>
								</div>
							)}

							{/* Phase 2: Processing */}
							{showProcessing && (
								<div className="animate-pulse space-y-4 text-center py-12">
									<div className="w-16 h-16 mx-auto rounded-full bg-hyper-green/20 flex items-center justify-center animate-spin-slow">
										<Link2 className="w-8 h-8 text-hyper-green" />
									</div>
									<h4 className="text-lg font-medium text-carbon dark:text-white">
										Extracting Meal...
									</h4>
									<p className="text-muted text-sm">
										Reading and analyzing the page.
									</p>
								</div>
							)}

							{/* Error State */}
							{showError && (
								<div className="flex flex-col items-center justify-center py-12 text-center text-red-500">
									<AlertCircle className="w-12 h-12 mb-4" />
									<h4 className="text-lg font-bold">Import Failed</h4>
									<p className="text-sm opacity-80 mb-6">{importError}</p>
									<button
										type="button"
										onClick={resetState}
										className="px-6 py-2 bg-platinum text-carbon dark:bg-white/10 dark:text-white rounded-lg hover:bg-platinum/80 dark:hover:bg-white/20"
									>
										Try Again
									</button>
								</div>
							)}

							{/* Phase 3: Single recipe approval */}
							{showApproval && recipe && (
								<div className="space-y-6">
									<div className="bg-white dark:bg-white/5 border border-carbon/5 dark:border-white/10 rounded-xl p-6">
										<h4 className="font-bold text-lg text-carbon dark:text-white mb-2">
											{recipe.name}
										</h4>
										<p className="text-sm text-muted line-clamp-3 mb-4">
											{recipe.description ?? ""}
										</p>

										<div className="flex gap-4 text-xs text-carbon/60 dark:text-white/60 mb-4">
											<div className="flex items-center gap-1">
												<Timer className="w-3 h-3" />
												{(recipe.prepTime ?? 0) + (recipe.cookTime ?? 0)}m
											</div>
											<div className="flex items-center gap-1">
												<ChefHat className="w-3 h-3" />
												{recipe.ingredients.length} ingr.
											</div>
										</div>

										<div className="space-y-1 mb-4">
											<h5 className="text-xs font-bold text-carbon dark:text-white uppercase tracking-wider mb-2">
												Key Ingredients
											</h5>
											{recipe.ingredients.slice(0, 6).map((ing) => (
												<div
													key={ing.ingredientName}
													className="flex justify-between text-xs text-muted"
												>
													<span>{ing.ingredientName}</span>
													<span>
														{ing.quantity} {ing.unit}
													</span>
												</div>
											))}
											{recipe.ingredients.length > 6 && (
												<div className="text-xs text-muted italic pt-1">
													+ {recipe.ingredients.length - 6} more
												</div>
											)}
										</div>

										{importedUrl && (
											<div className="mt-4 pt-3 border-t border-platinum dark:border-white/10">
												<a
													href={importedUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="text-xs text-hyper-green hover:underline truncate block"
												>
													Source: {(() => {
														try {
															return new URL(importedUrl).hostname;
														} catch {
															return importedUrl;
														}
													})()}
												</a>
											</div>
										)}
									</div>

									{saveFetcher.data &&
										typeof saveFetcher.data === "object" &&
										"error" in saveFetcher.data && (
											<div
												className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm"
												role="alert"
											>
												<AlertCircle className="w-4 h-4 shrink-0" />
												<span>
													{(saveFetcher.data as { error?: string }).error ??
														"Save failed"}
												</span>
											</div>
										)}

									<div className="flex flex-wrap items-center justify-between gap-4 pt-2">
										<button
											type="button"
											onClick={resetState}
											className="text-sm text-muted hover:text-hyper-green transition-colors"
										>
											Try Another URL
										</button>
										<button
											type="button"
											onClick={handleSave}
											disabled={saveFetcher.state !== "idle"}
											className="flex items-center gap-2 px-6 py-3 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow disabled:opacity-50 transition-all"
										>
											{saveFetcher.state !== "idle" ? (
												<span className="w-4 h-4 border-2 border-carbon/30 border-t-carbon rounded-full animate-spin" />
											) : (
												<>
													<Check className="w-4 h-4" />
													Save to Galley
												</>
											)}
										</button>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</>
	);
});

ImportRecipeButton.displayName = "ImportRecipeButton";
