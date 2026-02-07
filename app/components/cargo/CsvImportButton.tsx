import { useMemo, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { parseInventoryCsv } from "~/lib/csv-parser";
import type { ItemDomain } from "~/lib/domain";
import type { ScanResult } from "~/lib/schemas/scan";
import { ScanResultsModal } from "../scanner/ScanResultsModal";

const SCAN_UNITS = [
	"kg",
	"g",
	"lb",
	"oz",
	"l",
	"ml",
	"unit",
	"can",
	"pack",
] as const;

interface CsvImportButtonProps {
	onImportComplete?: () => void;
	defaultDomain?: ItemDomain;
}

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB

export function CsvImportButton({
	onImportComplete,
	defaultDomain,
}: CsvImportButtonProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const revalidator = useRevalidator();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [scanResult, setScanResult] = useState<ScanResult | null>(null);

	const acceptTypes = useMemo(
		() => ".csv,.tsv,text/csv,text/tab-separated-values",
		[],
	);

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		if (file.size > MAX_FILE_SIZE_BYTES) {
			setErrorMessage("CSV file is too large. Max size is 1 MB.");
			if (inputRef.current) inputRef.current.value = "";
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			const text = typeof reader.result === "string" ? reader.result : "";
			if (!text.trim()) {
				setErrorMessage("CSV file is empty.");
				return;
			}

			const result = parseInventoryCsv(text);
			const items = result.items.map((item) => ({
				id: crypto.randomUUID(),
				name: item.name,
				quantity: item.quantity,
				unit: SCAN_UNITS.includes(item.unit as (typeof SCAN_UNITS)[number])
					? (item.unit as (typeof SCAN_UNITS)[number])
					: "unit",
				domain: (item.domain ?? defaultDomain ?? "food") as ItemDomain,
				tags: item.tags ?? [],
				expiresAt: item.expiresAt,
				selected: true,
			}));

			if (items.length === 0) {
				setErrorMessage("No valid rows found in CSV.");
				setWarnings(result.warnings);
				return;
			}

			setWarnings(result.warnings);
			setErrorMessage(null);
			setScanResult({
				items,
				metadata: {
					source: "csv",
					filename: file.name,
					processedAt: new Date().toISOString(),
				},
			});
		};
		reader.onerror = () => {
			setErrorMessage("Failed to read CSV file.");
		};
		reader.readAsText(file);
	};

	const handleClose = () => {
		setScanResult(null);
		if (inputRef.current) inputRef.current.value = "";
	};

	const handleSuccess = () => {
		revalidator.revalidate();
		onImportComplete?.();
		setScanResult(null);
		if (inputRef.current) inputRef.current.value = "";
	};

	return (
		<>
			<div className="relative inline-block">
				<input
					ref={inputRef}
					type="file"
					accept={acceptTypes}
					className="hidden"
					onChange={handleFileChange}
				/>
				<button
					type="button"
					onClick={() => inputRef.current?.click()}
					className="flex items-center gap-2 px-4 py-3 bg-platinum text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
				>
					<span aria-hidden="true">📄</span>
					Import CSV
				</button>
			</div>

			{errorMessage && (
				<div className="text-xs text-danger mt-2">{errorMessage}</div>
			)}
			{warnings.length > 0 && (
				<div className="text-xs text-muted mt-2">
					{warnings.slice(0, 3).join(" • ")}
					{warnings.length > 3 ? " • ..." : ""}
				</div>
			)}

			{scanResult && (
				<ScanResultsModal
					result={scanResult}
					onClose={handleClose}
					onSuccess={handleSuccess}
				/>
			)}
		</>
	);
}
