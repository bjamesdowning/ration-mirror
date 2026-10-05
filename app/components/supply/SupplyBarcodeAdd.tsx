import { useState } from "react";
import { useFetcher, useRevalidator } from "react-router";

export function SupplyBarcodeAdd({ listId }: { listId: string }) {
	const fetcher = useFetcher();
	const revalidator = useRevalidator();
	const [barcode, setBarcode] = useState("");
	const [open, setOpen] = useState(false);

	return (
		<div className="space-y-2">
			<button
				type="button"
				className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold btn-secondary"
				onClick={() => setOpen((value) => !value)}
			>
				Add by barcode
			</button>
			{open && (
				<form
					className="flex flex-wrap items-end gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						const value = barcode.trim();
						if (!value) return;
						fetcher.submit(JSON.stringify({ barcode: value }), {
							method: "POST",
							action: `/api/supply-lists/${listId}/barcode`,
							encType: "application/json",
						});
						setBarcode("");
						revalidator.revalidate();
					}}
				>
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-semibold">Barcode</span>
						<input
							value={barcode}
							onChange={(event) => setBarcode(event.target.value)}
							inputMode="numeric"
							autoComplete="off"
							className="min-h-11 min-w-44 rounded-lg border border-platinum px-3"
							placeholder="Scan or type UPC"
						/>
					</label>
					<button
						type="submit"
						className="min-h-11 rounded-lg bg-hyper-green px-3 font-semibold text-on-hyper-green"
						disabled={fetcher.state !== "idle" || barcode.trim().length < 4}
					>
						Add item
					</button>
				</form>
			)}
		</div>
	);
}
