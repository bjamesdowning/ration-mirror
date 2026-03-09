import {
	forwardRef,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { useRevalidator } from "react-router";
import { FileIcon } from "~/components/icons/PageIcons";
import { parseInventoryCsv } from "~/lib/csv-parser";
import type { ItemDomain } from "~/lib/domain";
import type { ScanResult } from "~/lib/schemas/scan";
import { normalizeUnitAlias } from "~/lib/units";
import { ScanResultsModal } from "../scanner/ScanResultsModal";

export interface CsvImportButtonHandle {
	openImport: () => void;
}

interface CsvImportButtonProps {
	onImportComplete?: () => void;
	defaultDomain?: ItemDomain;
	className?: string;
}

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB

export const CsvImportButton = forwardRef<
	CsvImportButtonHandle,
	CsvImportButtonProps
>(({ onImportComplete, defaultDomain, className }, ref) => {
	const inputRef = useRef<HTMLInputElement>(null);
	const revalidator = useRevalidator();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [scanResult, setScanResult] = useState<ScanResult | null>(null);

	// Expose openImport method via ref
	useImperativeHandle(ref, () => ({
		openImport: () => {
			inputRef.current?.click();
		},
	}));

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
				unit: normalizeUnitAlias(item.unit),
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
			const truncated = result.warnings.some((w) =>
				w.toLowerCase().includes("row limit exceeded"),
			);
			setScanResult({
				items,
				metadata: {
					source: "csv",
					filename: file.name,
					processedAt: new Date().toISOString(),
					...(truncated && {
						truncationWarning:
							"Limit is 500 items per import. Only the first 500 will be added. Break your file into multiple imports to add more.",
					}),
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
			<div className={`relative ${className || "inline-block"}`}>
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
					className="flex items-center gap-2 px-4 py-3 btn-secondary font-semibold rounded-lg transition-all"
				>
					<FileIcon className="w-4 h-4" aria-hidden="true" />
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
});

CsvImportButton.displayName = "CsvImportButton";
