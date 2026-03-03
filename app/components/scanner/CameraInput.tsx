import { AlertCircle, Camera, RefreshCw, X } from "lucide-react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useFetcher, useRevalidator } from "react-router";
import { log } from "~/lib/logging.client";
import type { ScanResult } from "~/lib/schemas/scan";
import { ScanResultsModal } from "./ScanResultsModal";

export interface CameraInputHandle {
	openCamera: () => void;
}

interface CameraInputProps {
	onScanComplete?: () => void;
	className?: string;
}

type ScanApiResponse =
	| (ScanResult & {
			existingInventory?: Array<{
				id: string;
				name: string;
				quantity: number;
				unit: string;
			}>;
	  })
	| { status: "processing"; requestId: string };

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 60; // ~90 seconds

export const CameraInput = forwardRef<CameraInputHandle, CameraInputProps>(
	({ onScanComplete, className }, ref) => {
		const fetcher = useFetcher<ScanApiResponse>();
		const revalidator = useRevalidator();
		const inputRef = useRef<HTMLInputElement>(null);
		const [isAnalyzing, setIsAnalyzing] = useState(false);
		const [scanResult, setScanResult] = useState<ScanResult | null>(null);
		const [existingInventory, setExistingInventory] = useState<
			| Array<{ id: string; name: string; quantity: number; unit: string }>
			| undefined
		>(undefined);
		const [scanError, setScanError] = useState<string | null>(null);
		const [pollRequestId, setPollRequestId] = useState<string | null>(null);

		// Expose openCamera method via ref
		useImperativeHandle(ref, () => ({
			openCamera: () => {
				inputRef.current?.click();
			},
		}));

		// Resize parameters
		const MAX_DIMENSION = 1024; // Max width or height - reduced to prevent AI timeouts
		const COMPRESSION_QUALITY = 0.8;

		const showError = useCallback((message: string) => {
			setScanError(message);
			setIsAnalyzing(false);
			if (inputRef.current) inputRef.current.value = "";
		}, []);

		const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;

			setScanError(null);
			setIsAnalyzing(true);

			try {
				// Resize Image
				const resizedBlob = await resizeImage(
					file,
					MAX_DIMENSION,
					COMPRESSION_QUALITY,
				);

				const formData = new FormData();
				// Send as jpeg with original name (but forced .jpg extension)
				const filename = `${file.name.replace(/\.[^/.]+$/, "")}.jpg`;
				formData.append("image", resizedBlob, filename);

				fetcher.submit(formData, {
					method: "POST",
					action: "/api/scan",
					encType: "multipart/form-data",
				});
			} catch (error) {
				log.error("Image processing failed", error);
				showError("Failed to process image. Please try again.");
			}
		};

		// Helper to resize image
		const resizeImage = (
			file: File,
			maxDim: number,
			quality: number,
		): Promise<Blob> => {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = (event) => {
					const img = new Image();
					img.onload = () => {
						let width = img.width;
						let height = img.height;

						// Calculate new dimensions
						if (width > height) {
							if (width > maxDim) {
								height = Math.round(height * (maxDim / width));
								width = maxDim;
							}
						} else {
							if (height > maxDim) {
								width = Math.round(width * (maxDim / height));
								height = maxDim;
							}
						}

						const canvas = document.createElement("canvas");
						canvas.width = width;
						canvas.height = height;

						const ctx = canvas.getContext("2d");
						if (!ctx) {
							reject(new Error("Could not get canvas context"));
							return;
						}

						// Draw on white background (for transparent PNGs)
						ctx.fillStyle = "#FFFFFF";
						ctx.fillRect(0, 0, width, height);
						ctx.drawImage(img, 0, 0, width, height);

						canvas.toBlob(
							(blob) => {
								if (blob) {
									resolve(blob);
								} else {
									reject(new Error("Canvas to Blob failed"));
								}
							},
							"image/jpeg",
							quality,
						);
					};
					img.onerror = (err) => reject(err);
					img.src = event.target?.result as string;
				};
				reader.onerror = (err) => reject(err);
				reader.readAsDataURL(file);
			});
		};

		const lastState = useRef(fetcher.state);

		// Handle initial POST response: processing -> start poll; error -> show; success (legacy) -> show result
		useEffect(() => {
			if (
				isAnalyzing &&
				lastState.current !== "idle" &&
				fetcher.state === "idle"
			) {
				if (fetcher.data) {
					const d = fetcher.data as Record<string, unknown>;
					const err = d.error;
					if (typeof err === "string") {
						showError(`Scan failed: ${err}`);
						setIsAnalyzing(false);
					} else if (
						d.status === "processing" &&
						typeof d.requestId === "string"
					) {
						setPollRequestId(d.requestId);
					} else {
						showError("Scan failed. Please try again.");
						setIsAnalyzing(false);
					}
				} else {
					log.error("Scan fetcher completed with no data", undefined, {
						state: fetcher.state,
					});
					showError("Scan failed. Please try again.");
					setIsAnalyzing(false);
				}
			}
			lastState.current = fetcher.state;
		}, [fetcher.state, fetcher.data, isAnalyzing, showError]);

		// Poll scan status when requestId is set
		useEffect(() => {
			if (!pollRequestId) return;

			let attempts = 0;
			const poll = async () => {
				attempts++;
				if (attempts > MAX_POLL_ATTEMPTS) {
					showError("Scan timed out. Please try again.");
					setIsAnalyzing(false);
					setPollRequestId(null);
					return;
				}

				try {
					const res = await fetch(`/api/scan/status/${pollRequestId}`);
					if (res.status === 404) {
						showError("Job not found or expired. Please try again.");
						setIsAnalyzing(false);
						setPollRequestId(null);
						return;
					}
					const data = (await res.json()) as {
						status: "pending" | "completed" | "failed";
						items?: Array<Record<string, unknown>>;
						existingInventory?: Array<{
							id: string;
							name: string;
							quantity: number;
							unit: string;
						}>;
						error?: string;
					};

					if (data.status === "pending") {
						return; // Keep polling
					}
					if (data.status === "completed" && data.items) {
						const transformedResult = {
							items: data.items.map((item: Record<string, unknown>) => ({
								id: String(item.id ?? crypto.randomUUID()),
								name: String(item.name ?? "Unknown Item"),
								quantity: Number(item.quantity ?? 1),
								unit: String(
									item.unit ?? "unit",
								) as ScanResult["items"][number]["unit"],
								domain: "food" as const,
								tags: Array.isArray(item.tags) ? (item.tags as string[]) : [],
								expiresAt: item.expiresAt as string | undefined,
								selected: true as const,
								confidence: item.confidence as number | undefined,
								rawText: item.rawText as string | undefined,
							})),
							metadata: {
								source: "image" as const,
								processedAt: new Date().toISOString(),
							},
						} satisfies ScanResult;
						setScanResult(transformedResult);
						setExistingInventory(data.existingInventory ?? []);
						setIsAnalyzing(false);
						setPollRequestId(null);
					} else if (data.status === "failed") {
						showError(data.error ?? "Scan failed. Please try again.");
						setIsAnalyzing(false);
						setPollRequestId(null);
					}
				} catch {
					// Network error, keep polling until timeout
				}
			};

			const id = setInterval(poll, POLL_INTERVAL_MS);
			poll(); // first poll immediately

			return () => clearInterval(id);
		}, [pollRequestId, showError]);

		const handleModalClose = () => {
			setScanResult(null);
			setExistingInventory(undefined);
			setScanError(null);
			if (inputRef.current) inputRef.current.value = "";
		};

		const handleModalSuccess = () => {
			// Revalidate to refresh pantry list
			revalidator.revalidate();
			if (onScanComplete) {
				onScanComplete();
			}
		};

		return (
			<>
				<div className={`relative ${className || "inline-block"}`}>
					<input
						ref={inputRef}
						type="file"
						accept="image/*"
						capture="environment"
						className="hidden"
						onChange={handleFileChange}
						disabled={isAnalyzing}
					/>

					<button
						type="button"
						onClick={() => inputRef.current?.click()}
						disabled={isAnalyzing}
						className={`
                        flex items-center gap-2 px-4 py-3 
                        bg-hyper-green text-carbon font-semibold rounded-lg
                        shadow-glow-sm hover:shadow-glow transition-all
                        disabled:opacity-50 disabled:cursor-not-allowed
                        active:scale-95
                        ${isAnalyzing ? "animate-pulse" : ""}
                    `}
					>
						{isAnalyzing ? (
							<>
								<RefreshCw className="w-4 h-4 animate-spin" />
								Analyzing...
							</>
						) : (
							<>
								<Camera className="w-4 h-4" />
								Scan Item
							</>
						)}
					</button>

					{/* Visual Flair for Analyzing State */}
					{isAnalyzing && (
						<div className="absolute inset-0 border-2 border-hyper-green/50 rounded-lg animate-ping opacity-20 pointer-events-none" />
					)}
				</div>

				{/* Inline scan error banner */}
				{scanError && (
					<div
						role="alert"
						className="flex items-start gap-3 mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm max-w-xs"
					>
						<AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
						<span className="flex-1">{scanError}</span>
						<button
							type="button"
							onClick={() => setScanError(null)}
							aria-label="Dismiss error"
							className="shrink-0 hover:opacity-70 transition-opacity"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				)}

				{/* Scan in progress modal (blocking; rendered outside hidden wrapper so it is visible) */}
				{isAnalyzing && (
					<div
						className="fixed inset-0 z-[60] flex items-center justify-center bg-carbon/80 backdrop-blur-sm animate-fade-in"
						role="dialog"
						aria-modal="true"
						aria-labelledby="scan-progress-title"
						aria-describedby="scan-progress-desc"
					>
						{/* Non-dismissable backdrop - no onClick */}
						<div
							className="absolute inset-0 bg-transparent cursor-default"
							aria-hidden="true"
						/>
						<div className="bg-ceramic dark:bg-[#1A1A1A] border border-platinum dark:border-white/10 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto m-4 relative z-10 flex flex-col shadow-xl p-8">
							<div className="animate-pulse space-y-4 text-center">
								<div className="w-16 h-16 mx-auto rounded-full bg-hyper-green/20 flex items-center justify-center animate-spin-slow">
									<Camera className="w-8 h-8 text-hyper-green" />
								</div>
								<h4
									id="scan-progress-title"
									className="text-lg font-medium text-carbon dark:text-white"
								>
									Analyzing image...
								</h4>
								<p id="scan-progress-desc" className="text-muted text-sm">
									Identifying items. This may take a moment.
								</p>
							</div>
						</div>
					</div>
				)}

				{/* Scan Results Modal */}
				{scanResult && (
					<ScanResultsModal
						result={scanResult}
						existingInventory={existingInventory ?? []}
						onClose={handleModalClose}
						onSuccess={handleModalSuccess}
					/>
				)}
			</>
		);
	},
);

CameraInput.displayName = "CameraInput";
