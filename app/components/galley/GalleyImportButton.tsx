import {
	forwardRef,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { useRevalidator } from "react-router";
import { FileIcon } from "~/components/icons/PageIcons";
import { GalleyManifestSchema } from "~/lib/schemas/galley-manifest";
import { GalleyImportPreview } from "./GalleyImportPreview";

export interface GalleyImportButtonHandle {
	openImport: () => void;
}

interface GalleyImportButtonProps {
	onImportComplete?: () => void;
	className?: string;
}

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB

export const GalleyImportButton = forwardRef<
	GalleyImportButtonHandle,
	GalleyImportButtonProps
>(({ onImportComplete, className }, ref) => {
	const inputRef = useRef<HTMLInputElement>(null);
	const revalidator = useRevalidator();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [preview, setPreview] = useState<{
		manifest: import("~/lib/schemas/galley-manifest").GalleyManifest;
		filename: string;
	} | null>(null);

	useImperativeHandle(ref, () => ({
		openImport: () => {
			inputRef.current?.click();
		},
	}));

	const acceptTypes = useMemo(() => ".json,application/json", []);

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		if (file.size > MAX_FILE_SIZE_BYTES) {
			setErrorMessage("JSON file is too large. Max size is 1 MB.");
			if (inputRef.current) inputRef.current.value = "";
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			const text = typeof reader.result === "string" ? reader.result : "";
			if (!text.trim()) {
				setErrorMessage("JSON file is empty.");
				return;
			}

			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch {
				setErrorMessage("Invalid JSON file.");
				if (inputRef.current) inputRef.current.value = "";
				return;
			}

			const result = GalleyManifestSchema.safeParse(parsed);
			if (!result.success) {
				const first = result.error.issues[0];
				setErrorMessage(
					first
						? `${first.path.join(".")}: ${first.message}`
						: "Invalid manifest format",
				);
				if (inputRef.current) inputRef.current.value = "";
				return;
			}

			setErrorMessage(null);
			setPreview({
				manifest: result.data,
				filename: file.name,
			});
		};
		reader.onerror = () => {
			setErrorMessage("Failed to read file.");
		};
		reader.readAsText(file);
	};

	const handleClose = () => {
		setPreview(null);
		if (inputRef.current) inputRef.current.value = "";
	};

	const handleSuccess = () => {
		revalidator.revalidate();
		onImportComplete?.();
		setPreview(null);
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
					Import JSON
				</button>
			</div>

			{errorMessage && (
				<div className="text-xs text-danger mt-2">{errorMessage}</div>
			)}

			{preview && (
				<GalleyImportPreview
					manifest={preview.manifest}
					filename={preview.filename}
					onClose={handleClose}
					onSuccess={handleSuccess}
				/>
			)}
		</>
	);
});

GalleyImportButton.displayName = "GalleyImportButton";
