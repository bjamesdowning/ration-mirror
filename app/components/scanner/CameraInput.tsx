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

type ScanApiResponse = ScanResult & {
	existingInventory?: Array<{
		id: string;
		name: string;
		quantity: number;
		unit: string;
	}>;
};

export const CameraInput = forwardRef<CameraInputHandle, CameraInputProps>(
	({ onScanComplete, className }, ref) => {
		const fetcher = useFetcher<ScanApiResponse>();
		const revalidator = useRevalidator();
		const inputRef = useRef<HTMLInputElement>(null);
		const [isAnalyzing, setIsAnalyzing] = useState(false);
		const [scanResult, setScanResult] = useState<ScanResult | null>(null);
		const [existingInventory, setExistingInventory] =
			useState<ScanApiResponse["existingInventory"]>(undefined);
		const [scanError, setScanError] = useState<string | null>(null);

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

		useEffect(() => {
			// Detect when fetcher finishes a submission
			if (
				isAnalyzing &&
				lastState.current !== "idle" &&
				fetcher.state === "idle"
			) {
				setIsAnalyzing(false);

				if (fetcher.data) {
					log.debug("Scan fetcher success", { hasData: !!fetcher.data });
					if ("error" in fetcher.data) {
						showError(
							`Scan failed: ${(fetcher.data as { error: string }).error}`,
						);
					} else {
						// Success - transform raw items to include required properties
						// biome-ignore lint/suspicious/noExplicitAny: raw API response structure
						const rawItems = (fetcher.data as any).items || [];
						log.debug("Scan found items", { count: rawItems.length });
						const transformedResult: ScanResult = {
							// biome-ignore lint/suspicious/noExplicitAny: legacy
							items: rawItems.map((item: any) => ({
								id: crypto.randomUUID(),
								name: item.name || "Unknown Item",
								quantity: item.quantity ?? 1,
								unit: item.unit || "unit",
								domain: item.domain ?? "food",
								tags: item.tags || [],
								expiresAt: item.expiresAt,
								selected: true,
								confidence: item.confidence,
								rawText: item.rawText,
							})),
							metadata: {
								source: "image",
								processedAt: new Date().toISOString(),
							},
						};
						setScanResult(transformedResult);
						setExistingInventory(
							(fetcher.data as ScanApiResponse | undefined)?.existingInventory,
						);
					}
				} else {
					// No data returned but idle (likely an unexpected error)
					log.error("Scan fetcher completed with no data", undefined, {
						state: fetcher.state,
					});
					showError("Scan failed. Please try again.");
				}
			}
			lastState.current = fetcher.state;
		}, [fetcher.state, fetcher.data, isAnalyzing, showError]);

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
