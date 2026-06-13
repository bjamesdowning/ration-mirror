import { Toast } from "~/components/shell/Toast";
import { useToast } from "~/hooks/useToast";

type CopyFieldProps = {
	value: string;
	label?: string;
	copyLabel?: string;
	toastDescription?: string;
	className?: string;
};

export function CopyField({
	value,
	label,
	copyLabel = "Copy",
	toastDescription = "Copied to clipboard",
	className = "",
}: CopyFieldProps) {
	const copyToast = useToast({ duration: 3000 });

	return (
		<div className={className}>
			{label ? (
				<h4 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
					{label}
				</h4>
			) : null}
			<div className="flex gap-2">
				<code className="flex-1 text-xs bg-platinum/50 px-3 py-2 rounded-lg font-mono text-carbon break-all">
					{value}
				</code>
				<button
					type="button"
					onClick={() => {
						navigator.clipboard.writeText(value);
						copyToast.show();
					}}
					className="px-3 py-2 bg-hyper-green text-carbon text-xs font-semibold rounded-lg hover:bg-hyper-green/90 shrink-0"
				>
					{copyLabel}
				</button>
			</div>
			{copyToast.isOpen && (
				<Toast
					variant="success"
					title="Copied"
					description={toastDescription}
					onDismiss={copyToast.hide}
				/>
			)}
		</div>
	);
}
