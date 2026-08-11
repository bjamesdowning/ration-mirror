import {
	AlertCircle,
	Check,
	ExternalLink,
	ImageIcon,
	Link2,
} from "lucide-react";
import {
	type ChangeEvent,
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useFetcher, useNavigate, useRouteLoaderData } from "react-router";
import {
	AIFeatureIntroView,
	AIFeatureModal,
} from "~/components/ai/AIFeatureModal";
import { Toast } from "~/components/shell/Toast";
import { MAX_POLL_ATTEMPTS, startBackoffPollLoop } from "~/lib/polling";

const NUTRITION_INGEST_HINT =
	"Nutrition (when available): USDA match first; AI estimates are labelled—edit before saving.";

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

const SITE_BLOCKED_CODE = "SITE_BLOCKED";
const IMPORT_PROVIDER_UNAVAILABLE_CODE = "IMPORT_PROVIDER_UNAVAILABLE";
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

type ImportInputMode = "link" | "photo";

function buildImportIntroDescription(options: {
	costPerImport: number;
	web: boolean;
	social: boolean;
	photo: boolean;
}): string {
	const { costPerImport, web, social, photo } = options;
	const creditPhrase = `${costPerImport} credits per import`;

	let opener: string;
	if (photo && (web || social)) {
		opener = "Paste a recipe link or add a photo";
	} else if (photo) {
		opener = "Add a photo of a recipe";
	} else {
		opener = "Paste a recipe link";
	}

	const sourceParts: string[] = [];
	if (web) {
		sourceParts.push(
			"recipe websites (if a site blocks bots, we'll help you reload on-device or paste the page)",
		);
	}
	if (social) {
		sourceParts.push(
			"social posts using captions, descriptions, and transcripts when needed",
		);
	}
	if (photo && !web && !social) {
		sourceParts.push("your recipe photo");
	}

	let desc = `${opener} — ${creditPhrase}.`;
	if (sourceParts.length > 0) {
		desc += ` Ration pulls structure from ${sourceParts.join(", and from ")}.`;
	}
	desc += " Review before it lands in your Galley.";
	return desc;
}

function buildImportLinkHint(options: {
	web: boolean;
	social: boolean;
}): string {
	const { web, social } = options;
	const linkTypes: string[] = [];
	if (web) linkTypes.push("recipe websites");
	if (social) linkTypes.push("social posts");

	if (linkTypes.length === 0) {
		return "HTTPS links to supported recipe sources.";
	}

	let hint = `HTTPS links to ${linkTypes.join(" and ")}.`;
	if (web) {
		hint +=
			" If a site blocks bots, you can reload on-device or paste the page HTML.";
	}
	return hint;
}

function readPhotoAsBase64(file: File): Promise<{
	base64: string;
	mimeType: string;
	preview: string;
}> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== "string") {
				reject(new Error("Could not read photo"));
				return;
			}
			const comma = result.indexOf(",");
			const base64 = comma >= 0 ? result.slice(comma + 1) : result;
			resolve({ base64, mimeType: file.type, preview: result });
		};
		reader.onerror = () => reject(new Error("Could not read photo"));
		reader.readAsDataURL(file);
	});
}

function isSiteBlockedFailure(code?: string, error?: string): boolean {
	if (code === SITE_BLOCKED_CODE) return true;
	if (code === IMPORT_PROVIDER_UNAVAILABLE_CODE) return true;
	if (!error) return false;
	return /blocked automated import|access issue|paste the page HTML|import helpers are temporarily unavailable/i.test(
		error,
	);
}

export const ImportRecipeButton = forwardRef<
	ImportRecipeButtonHandle,
	ImportRecipeButtonProps
>(({ className, credits, costPerImport = 3 }, ref) => {
	const rootData = useRouteLoaderData("root") as
		| {
				clientFlags?: {
					nutritionEngine?: boolean;
					aiImportWeb?: boolean;
					aiImportSocial?: boolean;
					aiImportPhoto?: boolean;
				};
		  }
		| undefined;
	const nutritionEngine = rootData?.clientFlags?.nutritionEngine === true;
	const aiImportWeb = rootData?.clientFlags?.aiImportWeb === true;
	const aiImportSocial = rootData?.clientFlags?.aiImportSocial === true;
	const aiImportPhoto = rootData?.clientFlags?.aiImportPhoto === true;
	const linkEnabled = aiImportWeb || aiImportSocial;
	const showInputTabs = linkEnabled && aiImportPhoto;
	const importIntroDescription = buildImportIntroDescription({
		costPerImport,
		web: aiImportWeb,
		social: aiImportSocial,
		photo: aiImportPhoto,
	});
	const importLinkHint = buildImportLinkHint({
		web: aiImportWeb,
		social: aiImportSocial,
	});
	const [showModal, setShowModal] = useState(false);
	const [url, setUrl] = useState("");
	const [pageHtml, setPageHtml] = useState("");
	const [inputMode, setInputMode] = useState<ImportInputMode>("link");
	const [photoBase64, setPhotoBase64] = useState<string | null>(null);
	const [photoMimeType, setPhotoMimeType] = useState<string | null>(null);
	const [photoPreview, setPhotoPreview] = useState<string | null>(null);
	const [softFailMessage, setSoftFailMessage] = useState<string | null>(null);
	const photoInputRef = useRef<HTMLInputElement>(null);
	const [view, setView] = useState<
		| "intro"
		| "url"
		| "loading"
		| "verification"
		| "error"
		| "site_blocked"
		| "duplicate"
		| "soft_fail_photo"
	>("url");
	const [showImportInfo, setShowImportInfo] = useState(false);
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
		completeness?: "full" | "skeleton" | "link_holder";
		sourceUrl?: string;
	} | null>(null);
	const [assistedFailed, setAssistedFailed] = useState(false);
	const importInFlight = useRef(false);
	const assistedSubmit = useRef(false);
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

	const clearPhotoSelection = () => {
		setPhotoBase64(null);
		setPhotoMimeType(null);
		setPhotoPreview(null);
		if (photoInputRef.current) {
			photoInputRef.current.value = "";
		}
	};

	useImperativeHandle(ref, () => ({
		open: () => {
			setShowModal(true);
			setUrl("");
			setPageHtml("");
			setInputMode(linkEnabled ? "link" : "photo");
			clearPhotoSelection();
			setSoftFailMessage(null);
			setView("url");
			setShowImportInfo(false);
			setPollRequestId(null);
			setDuplicateData(null);
			setVerificationData(null);
			setAssistedFailed(false);
			assistedSubmit.current = false;
		},
	}));

	const switchToPhotoMode = () => {
		setInputMode("photo");
		setSoftFailMessage(null);
		setView("url");
		clearPhotoSelection();
	};

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
			assistedSubmit.current = false;
		} else if (typeof d.error === "string") {
			setErrorToastMessage(
				d.required != null && d.current != null
					? `Not enough credits. You need ${d.required} but have ${d.current}.`
					: d.error,
			);
			setShowErrorToast(true);
			setView("error");
			importInFlight.current = false;
			assistedSubmit.current = false;
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
				assistedSubmit.current = false;
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
					assistedSubmit.current = false;
					return;
				}
				const data = (await res.json()) as {
					status: "pending" | "completed" | "failed";
					success?: boolean;
					meal?: { id: string; name: string };
					extractedRecipe?: { name?: string; ingredients?: unknown[] };
					sourceUrl?: string;
					completeness?: "full" | "skeleton" | "link_holder";
					code?: string;
					error?: string;
					existingMealId?: string;
					existingMealName?: string;
					softFailToPhoto?: boolean;
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
					assistedSubmit.current = false;
					setAssistedFailed(false);
					setVerificationData({
						requestId: pollRequestId,
						mealName:
							typeof data.extractedRecipe.name === "string"
								? data.extractedRecipe.name
								: "Imported meal",
						ingredientCount: Array.isArray(data.extractedRecipe.ingredients)
							? data.extractedRecipe.ingredients.length
							: 0,
						completeness: data.completeness,
						sourceUrl: data.sourceUrl,
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
					assistedSubmit.current = false;
				} else if (
					data.status === "failed" ||
					(data.status === "completed" && !data.success)
				) {
					const blocked = isSiteBlockedFailure(data.code, data.error);
					setPollRequestId(null);
					importInFlight.current = false;

					if (data.softFailToPhoto === true && aiImportPhoto) {
						setSoftFailMessage(
							data.error ??
								"We couldn't extract a recipe from this link. Try a screenshot instead.",
						);
						setView("soft_fail_photo");
						assistedSubmit.current = false;
						return;
					}

					if (blocked && !assistedSubmit.current) {
						setAssistedFailed(false);
						setPageHtml("");
						setView("site_blocked");
						assistedSubmit.current = false;
						return;
					}

					if (blocked && assistedSubmit.current) {
						setAssistedFailed(true);
						setView("site_blocked");
						assistedSubmit.current = false;
						return;
					}

					setErrorToastMessage(
						data.error ?? "Import failed. Please try again.",
					);
					setShowErrorToast(true);
					setView("error");
					assistedSubmit.current = false;
				}
			} catch {
				// Network error, keep polling
			}
		};

		return startBackoffPollLoop(poll);
	}, [pollRequestId, aiImportPhoto]);

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
				setView("url");
				setUrl("");
				setPageHtml("");
				setPhotoBase64(null);
				setPhotoMimeType(null);
				setPhotoPreview(null);
				if (photoInputRef.current) {
					photoInputRef.current.value = "";
				}
				setSoftFailMessage(null);
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
		setView("url");
		setShowImportInfo(false);
		setUrl("");
		setPageHtml("");
		clearPhotoSelection();
		setSoftFailMessage(null);
		setVerificationData(null);
		setDuplicateData(null);
	};

	const handleImport = () => {
		const trimmed = url.trim();
		if (!trimmed || importInFlight.current) return;
		setView("loading");
		importInFlight.current = true;
		assistedSubmit.current = false;
		setAssistedFailed(false);
		setSoftFailMessage(null);
		setDuplicateData(null);
		importFetcher.submit(JSON.stringify({ url: trimmed }), {
			method: "post",
			action: "/api/meals/import",
			encType: "application/json",
		});
	};

	const handlePhotoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		try {
			const { base64, mimeType, preview } = await readPhotoAsBase64(file);
			setPhotoBase64(base64);
			setPhotoMimeType(mimeType);
			setPhotoPreview(preview);
		} catch {
			setErrorToastMessage("Could not read that photo. Try another image.");
			setShowErrorToast(true);
			clearPhotoSelection();
		}
	};

	const handlePhotoImport = () => {
		if (!photoBase64 || !photoMimeType || importInFlight.current) return;
		setView("loading");
		importInFlight.current = true;
		assistedSubmit.current = false;
		setAssistedFailed(false);
		setSoftFailMessage(null);
		setDuplicateData(null);
		importFetcher.submit(
			JSON.stringify({
				photoBase64,
				photoMimeType,
			}),
			{
				method: "post",
				action: "/api/meals/import",
				encType: "application/json",
			},
		);
	};

	const handleExtractFromPaste = () => {
		const trimmedUrl = url.trim();
		const trimmedHtml = pageHtml.trim();
		if (!trimmedUrl || trimmedHtml.length < 200 || importInFlight.current)
			return;
		const bytes = new TextEncoder().encode(trimmedHtml).byteLength;
		if (bytes > 1_000_000) {
			setErrorToastMessage(
				"Paste is too large (over 1MB). Copy only the recipe section or View Source excerpt.",
			);
			setShowErrorToast(true);
			return;
		}
		setView("loading");
		importInFlight.current = true;
		assistedSubmit.current = true;
		setAssistedFailed(false);
		setDuplicateData(null);
		importFetcher.submit(
			JSON.stringify({ url: trimmedUrl, pageHtml: trimmedHtml }),
			{
				method: "post",
				action: "/api/meals/import",
				encType: "application/json",
			},
		);
	};

	const resetState = () => {
		setUrl("");
		setPageHtml("");
		setInputMode(linkEnabled ? "link" : "photo");
		clearPhotoSelection();
		setSoftFailMessage(null);
		setView("url");
		setDuplicateData(null);
		setAssistedFailed(false);
		assistedSubmit.current = false;
	};

	/** Return to URL input without clearing the pasted link. */
	const retryKeepUrl = () => {
		setPageHtml("");
		setSoftFailMessage(null);
		setView("url");
		setDuplicateData(null);
		setAssistedFailed(false);
		assistedSubmit.current = false;
	};

	const handleClose = () => {
		setShowModal(false);
		setView("url");
		setShowImportInfo(false);
		setUrl("");
		setPageHtml("");
		setInputMode(linkEnabled ? "link" : "photo");
		clearPhotoSelection();
		setSoftFailMessage(null);
		setPollRequestId(null);
		setDuplicateData(null);
		setVerificationData(null);
		setAssistedFailed(false);
		assistedSubmit.current = false;
	};

	const showUrlInput = view === "url" || view === "intro";
	const showProcessing = view === "loading";
	const showVerification = view === "verification" && verificationData;
	const showError = view === "error";
	const showSiteBlocked = view === "site_blocked";
	const showDuplicate = view === "duplicate";
	const showSoftFailPhoto = view === "soft_fail_photo";
	const modalSubtitle =
		inputMode === "photo" && aiImportPhoto
			? "Add a recipe photo to extract a meal"
			: linkEnabled
				? "Paste a link to extract a meal"
				: "Add a photo to extract a meal";

	const completenessLabel = (c?: string) => {
		if (c === "link_holder") return "Saved link";
		if (c === "skeleton") return "Partial recipe";
		return "Recipe";
	};

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
					bg-hyper-green text-on-hyper-green font-semibold rounded-lg
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
					subtitle={modalSubtitle}
					icon={
						inputMode === "photo" && aiImportPhoto ? (
							<ImageIcon className="w-5 h-5 text-hyper-green" />
						) : (
							<Link2 className="w-5 h-5 text-hyper-green" />
						)
					}
					maxWidth="md"
				>
					{showImportInfo ? (
						<AIFeatureIntroView
							description={importIntroDescription}
							hint={nutritionEngine ? NUTRITION_INGEST_HINT : undefined}
							cost={costPerImport}
							costLabel="per import"
							credits={typeof credits === "number" ? credits : 0}
							onCancel={() => setShowImportInfo(false)}
							onConfirm={() => setShowImportInfo(false)}
							confirmLabel="Got it"
						/>
					) : (
						<div className="p-8">
							{showUrlInput && (
								<div className="space-y-6 text-center py-8">
									{showInputTabs && (
										<div
											className="flex gap-2 p-1 bg-platinum/50 dark:bg-white/10 rounded-xl max-w-md mx-auto"
											role="tablist"
											aria-label="Import source"
										>
											<button
												type="button"
												role="tab"
												aria-selected={inputMode === "link"}
												id="import-link-tab"
												aria-controls="import-input-panel"
												onClick={() => {
													setInputMode("link");
													clearPhotoSelection();
												}}
												className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all focus-ring ${
													inputMode === "link"
														? "bg-hyper-green text-on-hyper-green shadow-glow-sm"
														: "text-muted hover:bg-platinum hover:text-carbon dark:hover:bg-white/10 dark:hover:text-white"
												}`}
											>
												Link
											</button>
											<button
												type="button"
												role="tab"
												aria-selected={inputMode === "photo"}
												id="import-photo-tab"
												aria-controls="import-input-panel"
												onClick={() => {
													setInputMode("photo");
													setUrl("");
												}}
												className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all focus-ring ${
													inputMode === "photo"
														? "bg-hyper-green text-on-hyper-green shadow-glow-sm"
														: "text-muted hover:bg-platinum hover:text-carbon dark:hover:bg-white/10 dark:hover:text-white"
												}`}
											>
												Photo
											</button>
										</div>
									)}

									<div
										id="import-input-panel"
										role="tabpanel"
										aria-labelledby={
											inputMode === "photo"
												? "import-photo-tab"
												: "import-link-tab"
										}
									>
										{inputMode === "link" && linkEnabled ? (
											<>
												<div className="max-w-md mx-auto text-left">
													<div className="flex items-center justify-between mb-1">
														<label
															htmlFor="import-recipe-url"
															className="block text-sm font-medium text-carbon dark:text-white"
														>
															Recipe link
														</label>
														<button
															type="button"
															onClick={() => setShowImportInfo(true)}
															className="text-xs text-hyper-green hover:underline"
															aria-label="About recipe import"
														>
															Info
														</button>
													</div>
													<input
														id="import-recipe-url"
														type="url"
														value={url}
														onChange={(e) => setUrl(e.target.value)}
														placeholder="https://example.com/recipe/..."
														className="w-full px-4 py-3 rounded-lg border border-platinum dark:border-white/20 bg-white dark:bg-white/5 text-carbon dark:text-white placeholder:text-muted"
														aria-describedby="import-url-hint"
														// biome-ignore lint/a11y/noAutofocus: primary field on open
														autoFocus
													/>
													<p
														id="import-url-hint"
														className="text-xs text-muted mt-1"
													>
														{importLinkHint}
													</p>
												</div>
												<button
													type="button"
													onClick={handleImport}
													disabled={!url.trim()}
													className="mt-6 px-8 py-4 bg-hyper-green text-on-hyper-green font-bold rounded-xl shadow-glow hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
												>
													Import · {costPerImport} credit
													{costPerImport === 1 ? "" : "s"}
												</button>
											</>
										) : aiImportPhoto ? (
											<>
												<p className="text-carbon/80 dark:text-white/80 max-w-md mx-auto mb-6">
													Add a screenshot or photo of the recipe and we&apos;ll
													extract it into your Galley.
												</p>
												<div className="max-w-md mx-auto text-left space-y-4">
													<label
														htmlFor="import-recipe-photo"
														className="block text-sm font-medium text-carbon dark:text-white mb-1"
													>
														Recipe photo
													</label>
													<input
														ref={photoInputRef}
														id="import-recipe-photo"
														type="file"
														accept={PHOTO_ACCEPT}
														onChange={handlePhotoSelect}
														className="w-full text-sm text-carbon dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-hyper-green file:text-on-hyper-green file:font-semibold file:cursor-pointer"
														aria-describedby="import-photo-hint"
													/>
													<p
														id="import-photo-hint"
														className="text-xs text-muted"
													>
														JPEG, PNG, or WebP — a clear screenshot or photo of
														the full recipe works best.
													</p>
													{photoPreview && (
														<div className="rounded-lg border border-platinum dark:border-white/20 overflow-hidden bg-white dark:bg-white/5">
															<img
																src={photoPreview}
																alt="Selected recipe preview"
																className="w-full max-h-48 object-contain"
															/>
														</div>
													)}
												</div>
												<button
													type="button"
													onClick={handlePhotoImport}
													disabled={!photoBase64 || !photoMimeType}
													className="mt-6 px-8 py-4 bg-hyper-green text-on-hyper-green font-bold rounded-xl shadow-glow hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
												>
													Import · {costPerImport} credit
													{costPerImport === 1 ? "" : "s"}
												</button>
											</>
										) : null}
									</div>
								</div>
							)}

							{showProcessing && (
								<div className="animate-pulse space-y-4 text-center py-12">
									<div className="w-16 h-16 mx-auto rounded-full bg-hyper-green/20 flex items-center justify-center animate-spin-slow">
										{inputMode === "photo" && aiImportPhoto ? (
											<ImageIcon className="w-8 h-8 text-hyper-green" />
										) : (
											<Link2 className="w-8 h-8 text-hyper-green" />
										)}
									</div>
									<h4 className="text-lg font-medium text-carbon dark:text-white">
										{inputMode === "photo" && aiImportPhoto
											? "Analyzing Recipe Photo..."
											: "Extracting Meal..."}
									</h4>
									<p className="text-muted text-sm">
										{inputMode === "photo" && aiImportPhoto
											? "Reading ingredients and steps from your image."
											: "Reading and analyzing the page."}
									</p>
								</div>
							)}

							{showVerification && verificationData && (
								<div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
									<div className="w-14 h-14 rounded-full bg-hyper-green/10 flex items-center justify-center">
										<Check className="w-7 h-7 text-hyper-green" />
									</div>
									<p className="text-xs font-semibold uppercase tracking-wide text-hyper-green">
										{completenessLabel(verificationData.completeness)}
									</p>
									<h4 className="text-lg font-bold text-carbon dark:text-white capitalize">
										{verificationData.mealName}
									</h4>
									{verificationData.completeness === "link_holder" ? (
										<p className="text-sm text-muted max-w-sm">
											We saved the source link. Add ingredients later, or open
											the link for the full recipe.
										</p>
									) : verificationData.completeness === "skeleton" ? (
										<p className="text-sm text-muted max-w-sm">
											Partial recipe extracted (
											{verificationData.ingredientCount}{" "}
											{verificationData.ingredientCount === 1
												? "ingredient"
												: "ingredients"}
											). Review and add to Galley?
										</p>
									) : (
										<p className="text-sm text-muted">
											{verificationData.ingredientCount}{" "}
											{verificationData.ingredientCount === 1
												? "ingredient"
												: "ingredients"}{" "}
											extracted. Add to your Galley?
										</p>
									)}
									{verificationData.sourceUrl && (
										<a
											href={verificationData.sourceUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1.5 text-sm text-hyper-green hover:underline"
										>
											View source
											<ExternalLink className="w-3.5 h-3.5" />
										</a>
									)}
									<div className="flex gap-3 pt-2">
										<button
											type="button"
											onClick={handleAddToGalley}
											disabled={confirmFetcher.state !== "idle"}
											className="px-5 py-2.5 bg-hyper-green text-on-hyper-green font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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

							{showSiteBlocked && (
								<div className="max-w-md mx-auto space-y-5 py-6 text-left">
									<div className="text-center space-y-2">
										<AlertCircle className="w-10 h-10 mx-auto text-amber-600 dark:text-amber-400" />
										<h4 className="text-lg font-bold text-carbon dark:text-white">
											{assistedFailed
												? "Paste didn't work"
												: "This site blocked automated import"}
										</h4>
										<p className="text-sm text-muted">
											{assistedFailed
												? "The pasted content still looks like a block page or isn't a usable recipe. Open the recipe in your browser and add it manually, or try a different URL."
												: "Many recipe publishers block automated downloads. Your browser can open the page, but our servers cannot fetch it automatically."}
										</p>
									</div>

									{!assistedFailed && (
										<>
											<ol className="list-decimal list-inside space-y-2 text-sm text-carbon/90 dark:text-white/90">
												<li>Open the recipe link in a new tab.</li>
												<li>
													Copy the page source or recipe content (View Page
													Source, or Select All → Copy). Prefer the recipe
													section if the full page is huge.
												</li>
												<li>
													Paste it below and extract ({costPerImport} credits).
												</li>
											</ol>

											{url.trim() && (
												<a
													href={url.trim()}
													target="_blank"
													rel="noopener noreferrer"
													className="inline-flex items-center gap-2 text-sm font-medium text-hyper-green hover:underline"
												>
													Open recipe
													<ExternalLink className="w-3.5 h-3.5" />
												</a>
											)}

											<div>
												<label
													htmlFor="import-page-html"
													className="block text-sm font-medium text-carbon dark:text-white mb-1"
												>
													Page HTML
												</label>
												<textarea
													id="import-page-html"
													value={pageHtml}
													onChange={(e) => setPageHtml(e.target.value)}
													rows={8}
													placeholder="Paste the page HTML or recipe text here…"
													className="w-full px-3 py-2 rounded-lg border border-platinum dark:border-white/20 bg-white dark:bg-white/5 text-carbon dark:text-white placeholder:text-muted text-xs font-mono"
												/>
												<p className="text-xs text-muted mt-1">
													{costPerImport} credits. Keep under ~1MB (recipe
													excerpt is fine).
												</p>
											</div>

											<button
												type="button"
												onClick={handleExtractFromPaste}
												disabled={pageHtml.trim().length < 200}
												className="w-full px-6 py-3 bg-hyper-green text-on-hyper-green font-bold rounded-xl shadow-glow hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
											>
												Extract from paste
											</button>
										</>
									)}

									<div className="flex flex-col sm:flex-row gap-2 pt-1">
										<button
											type="button"
											onClick={() => {
												handleClose();
												navigate("/hub/galley/new");
											}}
											className="flex-1 px-4 py-2.5 bg-platinum/30 text-carbon dark:bg-white/10 dark:text-white rounded-lg hover:bg-platinum/50 dark:hover:bg-white/20 text-sm font-medium"
										>
											Add meal manually
										</button>
										<button
											type="button"
											onClick={resetState}
											className="flex-1 px-4 py-2.5 bg-platinum/20 text-carbon dark:text-white rounded-lg hover:bg-platinum/40 text-sm"
										>
											Try a different URL
										</button>
									</div>
								</div>
							)}

							{showSoftFailPhoto && (
								<div className="flex flex-col items-center justify-center py-12 text-center space-y-4 max-w-md mx-auto">
									<AlertCircle className="w-12 h-12 text-amber-600 dark:text-amber-400" />
									<h4 className="text-lg font-bold text-carbon dark:text-white">
										Couldn&apos;t extract from this link
									</h4>
									<p className="text-sm text-muted">
										{softFailMessage ??
											"We couldn't pull a recipe from this link. A screenshot often works better."}
									</p>
									<div className="flex flex-col sm:flex-row gap-2 pt-2">
										<button
											type="button"
											onClick={switchToPhotoMode}
											className="px-6 py-2.5 bg-hyper-green text-on-hyper-green font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all text-sm"
										>
											Import from screenshot
										</button>
										<button
											type="button"
											onClick={resetState}
											className="px-6 py-2.5 bg-platinum/20 text-carbon dark:text-white rounded-lg hover:bg-platinum/40 text-sm"
										>
											Try a different link
										</button>
									</div>
								</div>
							)}

							{showError && (
								<div className="flex flex-col items-center justify-center py-12 text-center text-red-500">
									<AlertCircle className="w-12 h-12 mb-4" />
									<h4 className="text-lg font-bold">Import Failed</h4>
									<p className="text-sm opacity-80 mb-6">{importError}</p>
									<div className="flex flex-col sm:flex-row gap-2">
										<button
											type="button"
											onClick={retryKeepUrl}
											className="px-6 py-2 bg-platinum text-carbon dark:bg-white/10 dark:text-white rounded-lg hover:bg-platinum/80 dark:hover:bg-white/20"
										>
											Try Again
										</button>
										<button
											type="button"
											onClick={() => {
												handleClose();
												navigate("/hub/galley/new");
											}}
											className="px-6 py-2 bg-platinum/20 text-carbon dark:text-white rounded-lg hover:bg-platinum/40 text-sm"
										>
											Add meal manually
										</button>
									</div>
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
												className="px-5 py-2.5 bg-hyper-green text-on-hyper-green font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all text-sm"
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
