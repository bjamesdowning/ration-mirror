// @ts-nocheck

import { Camera, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { useFetcher } from "react-router";

interface CameraInputProps {
	onScanComplete: (items: DetectedItem[]) => void;
}

export interface DetectedItem {
	name: string;
	quantity: number;
	tags: string[];
}

export function CameraInput({ onScanComplete }: CameraInputProps) {
	const fetcher = useFetcher();
	const inputRef = useRef<HTMLInputElement>(null);
	const [isAnalyzing, setIsAnalyzing] = useState(false);

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

	// Monitor fetcher state to detecting completion
	// We can use useEffect or just derive state.
	// However, since we need to call onScanComplete one-off, we should watch the data change.

	// Actually, let's use a useEffect to watch `fetcher.data`
	// But React Router 7 `useFetcher` returns data in `fetcher.data`.

	// Better pattern: Check if fetcher state went from submitting -> idle and has data.
	if (isAnalyzing && fetcher.state === "idle" && fetcher.data) {
		setIsAnalyzing(false);
		if (fetcher.data.items) {
			onScanComplete(fetcher.data.items);
		} else if (fetcher.data.error) {
			console.error("Scan error:", fetcher.data.error);
			alert(fetcher.data.error); // Simple alert for MVP
		}

		// Reset input so same file can be selected again
		if (inputRef.current) inputRef.current.value = "";
	}

	// Error handling state transition
	if (isAnalyzing && fetcher.state === "idle" && !fetcher.data) {
		// Maybe network error or something
		setIsAnalyzing(false);
	}

	return (
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
	);
}
