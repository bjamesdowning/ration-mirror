import { AlertCircle, Check, Link2 } from "lucide-react";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useFetcher, useNavigate } from "react-router";
import {
	AIFeatureIntroView,
	AIFeatureModal,
} from "~/components/ai/AIFeatureModal";
import { Toast } from "~/components/shell/Toast";
import { MAX_POLL_ATTEMPTS, POLL_INTERVAL_MS } from "~/lib/polling";

export interface ImportRecipeButtonHandle {
	open: () => void;
}

interface ImportRecipeButtonProps {
	className?: string;
	/** Current group credit balance (from hub loader); shown in modal when provided */
	credits?: number;
	/** Credit cost per import (from hub loader aiCosts.IMPORT_URL) */
	costPerImport?: number;
}

export const ImportRecipeButton = forwardRef<
	ImportRecipeButtonHandle,
	ImportRecipeButtonProps
>(({ className, credits, costPerImport = 1 }, ref) => {
	const [showModal, setShowModal] = useState(false);
	const [url, setUrl] = useState("");
	const [view, setView] = useState<
		"intro" | "url" | "loading" | "verification" | "error" | "duplicate"
	>("intro");
	const [showErrorToast, setShowErrorToast] = useState(false);
	const [errorToastMessage, setErrorToastMessage] = useState("");
	const [showSuccessToast, setShowSuccessToast] = useState(false);
	const [pollRequestId, setPollRequestId] = useState<string | null>(null);
	const [duplicateData, setDuplicateData] = useState<{
		existingMealId?: string;
		existingMealName?: string;
	} | null>(null);
	const [verificationData, setVerificationData] = useState<{
		requestId: string;
		mealName: string;
		ingredientCount: number;
	} | null>(null);
	const importInFlight = useRef(false);
	const importFetcher = useFetcher<
		| { status: "processing"; requestId: string }
		| {
				success: false;
				code: "DUPLICATE_URL";
				existingMealId?: string;
				existingMealName?: string;
		  }
		| { error: string; required?: number; current?: number }
	>();
	const confirmFetcher = useFetcher<
		{ meal: { id: string; name: string } } | { error: string }
	>();
	const navigate = useNavigate();

	useImperativeHandle(ref, () => ({
		open: () => {
			setShowModal(true);
			setUrl("");
			setView("intro");
			setPollRequestId(null);
			setDuplicateData(null);
			setVerificationData(null);
		},
	}));

	const importError =
		typeof importFetcher.data === "object" &&
		importFetcher.data !== null &&
		"error" in importFetcher.data
			? (importFetcher.data as { error?: string }).error
			: "Something went wrong. Check the URL and try again.";

	// Handle initial POST: processing -> start poll; DUPLICATE (409) -> duplicate; error -> error
	useEffect(() => {
		if (importFetcher.state !== "idle" || importFetcher.data === undefined)
			return;
		const d = importFetcher.data as Record<string, unknown>;
		if (d.status === "processing" && typeof d.requestId === "string") {
			setPollRequestId(d.requestId);
			setDuplicateData(null);
		} else if (d.code === "DUPLICATE_URL") {
			setDuplicateData({
				existingMealId: d.existingMealId as string | undefined,
				existingMealName: d.existingMealName as string | undefined,
			});
			setView("duplicate");
			importInFlight.current = false;
		} else if (typeof d.error === "string") {
			setErrorToastMessage(
				d.required != null && d.current != null
					? `Not enough credits. You need ${d.required} but have ${d.current}.`
					: d.error,
			);
			setShowErrorToast(true);
			setView("error");
			importInFlight.current = false;
		}
	}, [importFetcher.state, importFetcher.data]);

	// Poll import status when requestId is set
	useEffect(() => {
		if (!pollRequestId) return;

		let attempts = 0;
		const poll = async () => {
			attempts++;
			if (attempts > MAX_POLL_ATTEMPTS) {
				setErrorToastMessage("Import timed out. Please try again.");
				setShowErrorToast(true);
				setView("error");
				setPollRequestId(null);
				importInFlight.current = false;
				return;
			}
			try {
				const res = await fetch(`/api/meals/import/status/${pollRequestId}`, {
					credentials: "include",
				});
				if (res.status === 404) {
					setErrorToastMessage("Job not found or expired. Please try again.");
					setShowErrorToast(true);
					setView("error");
					setPollRequestId(null);
					importInFlight.current = false;
					return;
				}
				const data = (await res.json()) as {
					status: "pending" | "completed" | "failed";
					success?: boolean;
					meal?: { id: string; name: string };
					extractedRecipe?: { name?: string; ingredients?: unknown[] };
					sourceUrl?: string;
					code?: string;
					error?: string;
					existingMealId?: string;
					existingMealName?: string;
				};
				if (data.status === "pending") return;
				if (
					data.status === "completed" &&
					data.success &&
					data.extractedRecipe &&
					pollRequestId
				) {
					setPollRequestId(null);
					importInFlight.current = false;
					setVerificationData({
						requestId: pollRequestId,
						mealName:
							typeof data.extractedRecipe.name === "string"
								? data.extractedRecipe.name
								: "Imported meal",
						ingredientCount: Array.isArray(data.extractedRecipe.ingredients)
							? data.extractedRecipe.ingredients.length
							: 0,
					});
					setView("verification");
				} else if (
					data.status === "completed" &&
					data.code === "DUPLICATE_URL"
				) {
					setDuplicateData({
						existingMealId: data.existingMealId,
						existingMealName: data.existingMealName,
					});
					setView("duplicate");
					setPollRequestId(null);
					importInFlight.current = false;
				} else if (
					data.status === "failed" ||
					(data.status === "completed" && !data.success)
				) {
					setErrorToastMessage(
						data.error ?? "Import failed. Please try again.",
					);
					setShowErrorToast(true);
					setView("error");
					setPollRequestId(null);
					importInFlight.current = false;
				}
			} catch {
				// Network error, keep polling
			}
		};

		const id = setInterval(poll, POLL_INTERVAL_MS);
		poll();
		return () => clearInterval(id);
	}, [pollRequestId]);

	// Handle confirm success: navigate to meal, close modal, show toast
	useEffect(() => {
		if (
			confirmFetcher.state !== "idle" ||
			!confirmFetcher.data ||
			typeof confirmFetcher.data !== "object"
		)
			return;
		const d = confirmFetcher.data as Record<string, unknown>;
		if ("meal" in d && d.meal && typeof d.meal === "object") {
			const meal = d.meal as { id?: string; name?: string };
			if (meal.id) {
				setShowModal(false);
				setView("intro");
				setUrl("");
				setVerificationData(null);
				setDuplicateData(null);
				navigate(`/hub/galley/${meal.id}`);
				setShowSuccessToast(true);
			}
		} else if (typeof d.error === "string") {
			setErrorToastMessage(d.error);
			setShowErrorToast(true);
			// Reset verification view so user can try a new import (e.g. after session expiry)
			if (d.error.includes("session expired")) {
				setView("url");
				setVerificationData(null);
			}
		}
	}, [confirmFetcher.state, confirmFetcher.data, navigate]);

	const handleAddToGalley = () => {
		if (!verificationData) return;
		confirmFetcher.submit(
			JSON.stringify({ requestId: verificationData.requestId }),
			{
				method: "post",
				action: "/api/meals/import/confirm",
				encType: "application/json",
			},
		);
	};

	const handleDismissVerification = () => {
		setShowModal(false);
		setView("intro");
		setUrl("");
		setVerificationData(null);
		setDuplicateData(null);
	};

	const handleImport = () => {
		const trimmed = url.trim();
		if (!trimmed) return;
		setView("loading");
		importInFlight.current = true;
		setDuplicateData(null);
		importFetcher.submit(JSON.stringify({ url: trimmed }), {
			method: "post",
			action: "/api/meals/import",
			encType: "application/json",
		});
	};

	const resetState = () => {
		setUrl("");
		setView("url");
		setDuplicateData(null);
	};

	const handleClose = () => {
		setShowModal(false);
		setView("intro");
		setUrl("");
		setPollRequestId(null);
		setDuplicateData(null);
		setVerificationData(null);
	};

	const showIntro = view === "intro";
	const showUrlInput = view === "url";
	const showProcessing = view === "loading";
	const showVerification = view === "verification" && verificationData;
	const showError = view === "error";
	const showDuplicate = view === "duplicate";

	return (
		<>
			{showErrorToast && (
				<Toast
					variant="error"
					position="top-right"
					title="Import Failed"
					description={errorToastMessage}
					onDismiss={() => setShowErrorToast(false)}
				/>
			)}
			{showSuccessToast && (
				<Toast
					variant="success"
					position="top-right"
					title="Meal imported"
					description="The recipe has been added to your Galley."
					onDismiss={() => setShowSuccessToast(false)}
				/>
			)}
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
				<AIFeatureModal
					open={showModal}
					onClose={handleClose}
					title="Import Meal"
					subtitle="Paste a URL to extract a meal"
					icon={<Link2 className="w-5 h-5 text-hyper-green" />}
					maxWidth="md"
				>
					{showIntro ? (
						<AIFeatureIntroView
							description="Paste a recipe link. AI extracts ingredients and steps into your Galley so you have one place to cook from."
							cost={costPerImport}
							costLabel="per import"
							credits={typeof credits === "number" ? credits : 0}
							onCancel={handleClose}
							onConfirm={() => setView("url")}
							confirmLabel="Continue"
						/>
					) : (
						<div className="p-8">
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
											HTTPS only. Tested with allrecipes.com and most major
											recipe sites. Some sites block imports.
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

							{showVerification && verificationData && (
								<div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
									<div className="w-14 h-14 rounded-full bg-hyper-green/10 flex items-center justify-center">
										<Check className="w-7 h-7 text-hyper-green" />
									</div>
									<h4 className="text-lg font-bold text-carbon dark:text-white capitalize">
										{verificationData.mealName}
									</h4>
									<p className="text-sm text-muted">
										{verificationData.ingredientCount}{" "}
										{verificationData.ingredientCount === 1
											? "ingredient"
											: "ingredients"}{" "}
										extracted. Add to your Galley?
									</p>
									<div className="flex gap-3 pt-2">
										<button
											type="button"
											onClick={handleAddToGalley}
											disabled={confirmFetcher.state !== "idle"}
											className="px-5 py-2.5 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
										>
											{confirmFetcher.state !== "idle"
												? "Adding..."
												: "Add to Galley"}
										</button>
										<button
											type="button"
											onClick={handleDismissVerification}
											disabled={confirmFetcher.state !== "idle"}
											className="px-5 py-2.5 bg-platinum/20 text-carbon dark:text-white rounded-lg hover:bg-platinum/40 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
										>
											Dismiss
										</button>
									</div>
								</div>
							)}

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

							{showDuplicate && (
								<div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
									<div className="w-14 h-14 rounded-full bg-hyper-green/10 flex items-center justify-center">
										<Check className="w-7 h-7 text-hyper-green" />
									</div>
									<h4 className="text-lg font-bold text-carbon dark:text-white">
										Already in Your Galley
									</h4>
									<p className="text-sm text-muted max-w-xs">
										{duplicateData?.existingMealName
											? `"${duplicateData.existingMealName}" was imported from this URL before.`
											: "This URL has already been imported."}
									</p>
									<div className="flex gap-3 pt-2">
										{duplicateData?.existingMealId && (
											<button
												type="button"
												onClick={() => {
													handleClose();
													navigate(
														`/hub/galley/${duplicateData.existingMealId}`,
													);
												}}
												className="px-5 py-2.5 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all text-sm"
											>
												View Existing Meal
											</button>
										)}
										<button
											type="button"
											onClick={resetState}
											className="px-5 py-2.5 bg-platinum/20 text-carbon dark:text-white rounded-lg hover:bg-platinum/40 transition-colors text-sm"
										>
											Import Different URL
										</button>
									</div>
								</div>
							)}
						</div>
					)}
				</AIFeatureModal>
			)}
		</>
	);
});

ImportRecipeButton.displayName = "ImportRecipeButton";
