import { Camera, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import type { ScanResult } from "~/lib/schemas/scan";
import { ScanResultsModal } from "./ScanResultsModal";

interface CameraInputProps {
	onScanComplete?: () => void;
}

export function CameraInput({ onScanComplete }: CameraInputProps) {
	const fetcher = useFetcher<ScanResult>();
	const revalidator = useRevalidator();
	const inputRef = useRef<HTMLInputElement>(null);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [scanResult, setScanResult] = useState<ScanResult | null>(null);

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setIsAnalyzing(true);

		const formData = new FormData();
		formData.append("image", file);

		fetcher.submit(formData, {
			method: "POST",
			action: "/api/scan",
			encType: "multipart/form-data",
		});
	};

	// Monitor fetcher state to detect completion
	if (isAnalyzing && fetcher.state === "idle" && fetcher.data) {
		setIsAnalyzing(false);

		// Check for errors
		if ("error" in fetcher.data) {
			alert(`Scan failed: ${fetcher.data.error}`);
			if (inputRef.current) inputRef.current.value = "";
		} else {
			// Success - show results modal
			setScanResult(fetcher.data as ScanResult);
		}
	}

	// Error handling state transition
	if (isAnalyzing && fetcher.state === "idle" && !fetcher.data) {
		setIsAnalyzing(false);
		alert("Scan failed. Please try again.");
		if (inputRef.current) inputRef.current.value = "";
	}

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
}
