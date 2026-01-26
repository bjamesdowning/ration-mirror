import { Form, Link } from "react-router";
import type { MealInput } from "~/lib/schemas/meal";

interface MealDetailProps {
	meal: MealInput & { id: string };
	isOwner: boolean;
}

export function MealDetail({ meal, isOwner }: MealDetailProps) {
	return (
		<div className="max-w-4xl mx-auto space-y-8 font-mono text-[#39FF14]">
			{/* Header */}
			<div className="border-b-2 border-[#39FF14] pb-6 flex justify-between items-start">
				<div>
					<div className="text-xs opacity-50 mb-2">
						{"//"} PROTOCOL: {meal.id.slice(0, 8)}
					</div>
					<h1 className="text-4xl font-bold uppercase tracking-wider mb-2 text-white glow-green">
						{meal.name}
					</h1>
					{meal.description && (
						<p className="text-lg opacity-80 max-w-2xl">{meal.description}</p>
					)}
				</div>
				<div className="flex flex-col gap-2 text-right">
					{isOwner && (
						<div className="flex gap-2 justify-end">
							<Link
								to="edit"
								className="px-3 py-1 border border-[#39FF14] text-sm uppercase hover:bg-[#39FF14]/10"
							>
								[EDIT]
							</Link>
							<Form
								method="post"
								action={`/api/meals/${meal.id}`}
								onSubmit={(e) => {
									if (!confirm("Confirm Protocol Termination?"))
										e.preventDefault();
								}}
							>
								<input type="hidden" name="_method" value="DELETE" />
								<button
									type="submit"
									className="px-3 py-1 border border-red-500 text-red-500 text-sm uppercase hover:bg-red-500/10"
								>
									[TERMINATE]
								</button>
							</Form>
						</div>
					)}
					<div className="mt-4 flex gap-4 text-sm">
						<div className="flex flex-col items-center">
							<span className="opacity-50 text-[10px]">PREP</span>
							<span className="font-bold">{meal.prepTime || "--"}m</span>
						</div>
						<div className="flex flex-col items-center">
							<span className="opacity-50 text-[10px]">COOK</span>
							<span className="font-bold">{meal.cookTime || "--"}m</span>
						</div>
						<div className="flex flex-col items-center">
							<span className="opacity-50 text-[10px]">YIELD</span>
							<span className="font-bold">{meal.servings}</span>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
				{/* Right Col: Ingredients (Visual hierarchy: Ingredients are crucial data) */}
				<div className="lg:col-span-1 border border-[#39FF14]/30 bg-[#051105]/50 p-6">
					<h3 className="text-xl font-bold uppercase mb-6 flex items-center gap-2">
						<span className="w-2 h-2 bg-[#39FF14]"></span>
						Manifest
					</h3>
					<ul className="space-y-3">
						{meal.ingredients.map((ing) => (
							<li
								key={ing.ingredientName}
								className="flex justify-between items-baseline border-b border-[#39FF14]/10 pb-2 last:border-0"
							>
								<span className="uppercase text-sm">
									{ing.ingredientName}
									{ing.isOptional && (
										<span className="text-[10px] ml-2 opacity-50">(OPT)</span>
									)}
								</span>
								<span className="font-bold">
									{ing.quantity}{" "}
									<span className="opacity-60 text-xs">{ing.unit}</span>
								</span>
							</li>
						))}
					</ul>

					{/* Cook Action */}
					<Form
						method="post"
						action={`/api/meals/${meal.id}/cook`}
						className="mt-8"
					>
						<button
							type="submit"
							className="w-full py-3 bg-[#39FF14]/10 border border-[#39FF14] text-[#39FF14] hover:bg-[#39FF14] hover:text-black transition-all font-bold uppercase tracking-widest"
						>
							INITIATE COOK SEQUENCE
						</button>
						<p className="text-[10px] text-center mt-2 opacity-50 uppercase">
							{"//"} Will deduct inventory items
						</p>
					</Form>
				</div>

				{/* Left Col: Directions */}
				<div className="lg:col-span-2">
					<h3 className="text-xl font-bold uppercase mb-6 flex items-center gap-2">
						<span className="w-2 h-2 bg-[#39FF14]"></span>
						Directives
					</h3>
					<div className="prose prose-invert prose-p:font-mono prose-em:text-[#39FF14] max-w-none text-white/90">
						{meal.directions ? (
							<div className="whitespace-pre-wrap leading-relaxed">
								{meal.directions}
							</div>
						) : (
							<p className="opacity-30 italic">
								{"//"} NO DIRECTIVES SPECIFIED
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
