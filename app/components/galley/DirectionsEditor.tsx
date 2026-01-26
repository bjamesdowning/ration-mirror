export function DirectionsEditor({
	defaultValue,
	name = "directions",
}: {
	defaultValue?: string;
	name?: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<label
				htmlFor={name}
				className="text-[#39FF14] font-mono text-sm uppercase"
			>
				Operational Directives
			</label>
			<textarea
				id={name}
				name={name}
				defaultValue={defaultValue}
				className="w-full h-40 bg-[#051105] border border-[#39FF14]/50 text-[#39FF14] font-mono p-4 focus:outline-none focus:border-[#39FF14] focus:shadow-[0_0_10px_rgba(57,255,20,0.2)]"
				placeholder={"// ENTER PREPARATION SEQUENCE..."}
			/>
		</div>
	);
}
