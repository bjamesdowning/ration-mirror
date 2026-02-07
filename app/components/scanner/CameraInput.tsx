import { Camera, RefreshCw } from "lucide-react";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useFetcher, useRevalidator } from "react-router";
import type { ScanResult } from "~/lib/schemas/scan";
import { ScanResultsModal } from "./ScanResultsModal";

export interface CameraInputHandle {
	openCamera: () => void;
}

interface CameraInputProps {
	onScanComplete?: () => void;
}

export const CameraInput = forwardRef<CameraInputHandle, CameraInputProps>(
	({ onScanComplete }, ref) => {
		const fetcher = useFetcher<ScanResult>();
		const revalidator = useRevalidator();
		const inputRef = useRef<HTMLInputElement>(null);
		const [isAnalyzing, setIsAnalyzing] = useState(false);
		const [scanResult, setScanResult] = useState<ScanResult | null>(null);

		// Expose openCamera method via ref
		useImperativeHandle(ref, () => ({
			openCamera: () => {
				inputRef.current?.click();
			},
		}));

		// Resize parameters
		const MAX_DIMENSION = 1024; // Max width or height - reduced to prevent AI timeouts
		const COMPRESSION_QUALITY = 0.8;

		const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;

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
				console.error("Image processing failed:", error);
				alert("Failed to process image. Please try again.");
				setIsAnalyzing(false);
				if (inputRef.current) inputRef.current.value = "";
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
					console.log("[SCAN] Fetcher success data:", fetcher.data);
					if ("error" in fetcher.data) {
						alert(`Scan failed: ${fetcher.data.error}`);
						if (inputRef.current) inputRef.current.value = "";
					} else {
						// Success - transform raw items to include required properties
						// biome-ignore lint/suspicious/noExplicitAny: raw API response structure
						const rawItems = (fetcher.data as any).items || [];
						console.log(`[SCAN] Found ${rawItems.length} items`);
						const transformedResult: ScanResult = {
							// biome-ignore lint/suspicious/noExplicitAny: legacy
							items: rawItems.map((item: any) => ({
								id: crypto.randomUUID(),
								name: item.name || "Unknown Item",
								quantity: item.quantity ?? 1,
								unit: item.unit || "unit",
								category: item.category,
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
					}
				} else {
					// No data returned but idle (likely an unexpected error)
					console.error(
						"[SCAN] Fetcher completed with NO data. State:",
						fetcher.state,
					);
					alert("Scan failed. Please try again.");
					if (inputRef.current) inputRef.current.value = "";
				}
			}
			lastState.current = fetcher.state;
		}, [fetcher.state, fetcher.data, isAnalyzing]);

		const handleModalClose = () => {
			setScanResult(null);
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
				<div className="relative inline-block">
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

				{/* Scan Results Modal */}
				{scanResult && (
					<ScanResultsModal
						result={scanResult}
						onClose={handleModalClose}
						onSuccess={handleModalSuccess}
					/>
				)}
			</>
		);
	},
);

CameraInput.displayName = "CameraInput";
