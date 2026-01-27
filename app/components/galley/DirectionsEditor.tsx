export function DirectionsEditor({
	defaultValue,
	name = "directions",
}: {
	defaultValue?: string;
	name?: string;
}) {
	return (
		<div className="glass-panel rounded-xl p-4 flex flex-col gap-2">
			<label htmlFor={name} className="text-label text-muted text-sm">
				Directions
			</label>
			<textarea
				id={name}
				name={name}
				defaultValue={defaultValue}
				className="w-full h-40 bg-platinum rounded-lg text-carbon p-4 placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none resize-none"
				placeholder="Enter preparation steps..."
			/>
		</div>
	);
}
