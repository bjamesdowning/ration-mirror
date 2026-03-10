// Static measurement reference tables for SEO-indexable content.

type ReferenceRow = { from: string; to: string; value: string };

const VOLUME_TABLE: ReferenceRow[] = [
	{ from: "1 teaspoon (tsp)", to: "milliliters", value: "4.93 ml" },
	{ from: "1 tablespoon (tbsp)", to: "milliliters", value: "14.79 ml" },
	{ from: "1 tablespoon (tbsp)", to: "teaspoons", value: "3 tsp" },
	{ from: "1 fluid ounce (fl oz)", to: "milliliters", value: "29.57 ml" },
	{ from: "1 fluid ounce (fl oz)", to: "tablespoons", value: "2 tbsp" },
	{ from: "1 cup", to: "milliliters", value: "236.59 ml" },
	{ from: "1 cup", to: "tablespoons", value: "16 tbsp" },
	{ from: "1 cup", to: "fluid ounces", value: "8 fl oz" },
	{ from: "1 pint (pt)", to: "cups", value: "2 cups" },
	{ from: "1 pint (pt)", to: "milliliters", value: "473.18 ml" },
	{ from: "1 quart (qt)", to: "pints", value: "2 pt" },
	{ from: "1 quart (qt)", to: "liters", value: "0.946 l" },
	{ from: "1 gallon (gal)", to: "quarts", value: "4 qt" },
	{ from: "1 gallon (gal)", to: "liters", value: "3.785 l" },
	{ from: "1 liter (l)", to: "milliliters", value: "1,000 ml" },
	{ from: "1 liter (l)", to: "cups", value: "4.227 cups" },
];

const WEIGHT_TABLE: ReferenceRow[] = [
	{ from: "1 ounce (oz)", to: "grams", value: "28.35 g" },
	{ from: "1 pound (lb)", to: "ounces", value: "16 oz" },
	{ from: "1 pound (lb)", to: "grams", value: "453.59 g" },
	{ from: "1 pound (lb)", to: "kilograms", value: "0.4536 kg" },
	{ from: "1 kilogram (kg)", to: "grams", value: "1,000 g" },
	{ from: "1 kilogram (kg)", to: "pounds", value: "2.205 lb" },
	{ from: "100 grams (g)", to: "ounces", value: "3.527 oz" },
	{ from: "500 grams (g)", to: "pounds", value: "1.102 lb" },
];

// Derived from density data: 1 cup of each ingredient in grams
const BAKING_QUICK_REF: Array<{
	ingredient: string;
	cup: string;
	tbsp: string;
	tsp: string;
}> = [
	{
		ingredient: "All-purpose flour",
		cup: "125 g",
		tbsp: "7.8 g",
		tsp: "2.6 g",
	},
	{ ingredient: "Bread flour", cup: "127 g", tbsp: "8 g", tsp: "2.7 g" },
	{ ingredient: "Cake flour", cup: "114 g", tbsp: "7.1 g", tsp: "2.4 g" },
	{
		ingredient: "Whole wheat flour",
		cup: "118 g",
		tbsp: "7.4 g",
		tsp: "2.5 g",
	},
	{ ingredient: "Almond flour", cup: "96 g", tbsp: "6 g", tsp: "2 g" },
	{ ingredient: "Cocoa powder", cup: "82 g", tbsp: "5.2 g", tsp: "1.7 g" },
	{ ingredient: "Cornstarch", cup: "90 g", tbsp: "5.6 g", tsp: "1.9 g" },
	{
		ingredient: "Granulated sugar",
		cup: "200 g",
		tbsp: "12.5 g",
		tsp: "4.2 g",
	},
	{ ingredient: "Caster sugar", cup: "208 g", tbsp: "13 g", tsp: "4.3 g" },
	{
		ingredient: "Powdered / icing sugar",
		cup: "120 g",
		tbsp: "7.5 g",
		tsp: "2.5 g",
	},
	{
		ingredient: "Brown sugar (packed)",
		cup: "220 g",
		tbsp: "13.8 g",
		tsp: "4.6 g",
	},
	{ ingredient: "Coconut sugar", cup: "200 g", tbsp: "12.5 g", tsp: "4.2 g" },
	{ ingredient: "Butter (melted)", cup: "227 g", tbsp: "14.2 g", tsp: "4.7 g" },
	{ ingredient: "Honey", cup: "340 g", tbsp: "21.3 g", tsp: "7.1 g" },
	{ ingredient: "Maple syrup", cup: "322 g", tbsp: "20.1 g", tsp: "6.7 g" },
	{ ingredient: "Olive oil", cup: "218 g", tbsp: "13.6 g", tsp: "4.5 g" },
	{ ingredient: "Rolled oats", cup: "82 g", tbsp: "5.2 g", tsp: "1.7 g" },
	{
		ingredient: "White rice (dry)",
		cup: "201 g",
		tbsp: "12.6 g",
		tsp: "4.2 g",
	},
	{ ingredient: "Baking powder", cup: "213 g", tbsp: "13.3 g", tsp: "4.4 g" },
	{ ingredient: "Baking soda", cup: "206 g", tbsp: "12.9 g", tsp: "4.3 g" },
	{ ingredient: "Salt (table)", cup: "288 g", tbsp: "18 g", tsp: "6 g" },
];

function RefTable({
	title,
	id,
	rows,
	cols,
	children,
}: {
	title: string;
	id: string;
	rows: Record<string, string>[];
	cols: Array<{ key: string; label: string }>;
	children?: React.ReactNode;
}) {
	return (
		<section
			aria-labelledby={id}
			className="glass-panel rounded-2xl p-6 md:p-8"
		>
			<div className="w-6 h-[3px] bg-hyper-green rounded-full mb-4" />
			<h2 id={id} className="text-display text-lg text-carbon mb-1">
				{title}
			</h2>
			{children && (
				<p className="text-sm text-muted mb-5 leading-relaxed">{children}</p>
			)}
			<div className="overflow-x-auto -mx-2 px-2">
				<table className="w-full text-sm font-mono">
					<thead>
						<tr className="border-b border-carbon/10">
							{cols.map((col) => (
								<th
									key={col.key}
									scope="col"
									className="text-left py-2 px-3 text-label text-muted first:pl-0"
								>
									{col.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr
								key={cols.map((c) => row[c.key]).join("|")}
								className="border-b border-carbon/5 last:border-0 hover:bg-carbon/[0.02] transition-colors"
							>
								{cols.map((col) => (
									<td
										key={col.key}
										className="py-2.5 px-3 text-carbon first:pl-0"
									>
										{col.key === "value" ||
										col.key === "cup" ||
										col.key === "tbsp" ||
										col.key === "tsp" ? (
											<span className="text-hyper-green font-bold">
												{row[col.key]}
											</span>
										) : (
											row[col.key]
										)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

export function MeasurementReference() {
	return (
		<div className="space-y-8">
			<div>
				<span className="text-xs font-bold uppercase tracking-wider text-hyper-green">
					Reference Tables
				</span>
				<h2 className="text-display text-2xl text-carbon mt-1 mb-2">
					Common Cooking Measurements
				</h2>
				<p className="text-muted text-sm max-w-2xl leading-relaxed">
					Quick-reference tables for standard cooking and baking conversions.
					Baking weights are derived from real ingredient densities — more
					accurate than rule-of-thumb charts.
				</p>
			</div>

			<RefTable
				id="volume-ref"
				title="Volume Conversions"
				rows={VOLUME_TABLE as unknown as Record<string, string>[]}
				cols={[
					{ key: "from", label: "From" },
					{ key: "to", label: "Equals (unit)" },
					{ key: "value", label: "Value" },
				]}
			>
				US customary and metric volume equivalents used in cooking and baking.
			</RefTable>

			<RefTable
				id="weight-ref"
				title="Weight Conversions"
				rows={WEIGHT_TABLE as unknown as Record<string, string>[]}
				cols={[
					{ key: "from", label: "From" },
					{ key: "to", label: "Equals (unit)" },
					{ key: "value", label: "Value" },
				]}
			>
				Imperial and metric weight equivalents for grocery shopping and recipe
				scaling.
			</RefTable>

			<RefTable
				id="baking-ref"
				title="Baking Ingredient Weights"
				rows={BAKING_QUICK_REF as unknown as Record<string, string>[]}
				cols={[
					{ key: "ingredient", label: "Ingredient" },
					{ key: "cup", label: "1 cup" },
					{ key: "tbsp", label: "1 tbsp" },
					{ key: "tsp", label: "1 tsp" },
				]}
			>
				Weight in grams for common baking ingredients. Based on density data
				sourced from King Arthur Baking and USDA nutrition tables. "Spooned and
				leveled" method for flours; packed for brown sugar.
			</RefTable>

			{/* Supplemental SEO content */}
			<section className="glass-panel rounded-2xl p-6 md:p-8">
				<div className="w-6 h-[3px] bg-hyper-green rounded-full mb-4" />
				<h2 className="text-display text-lg text-carbon mb-3">
					Why ingredient density matters
				</h2>
				<div className="prose-article text-sm space-y-3">
					<p>
						A cup is a volume measurement, not a weight. The number of grams in
						a cup depends entirely on what you are measuring. A cup of
						all-purpose flour weighs about <strong>125 g</strong> when spooned
						and leveled, but a cup of granulated sugar weighs about{" "}
						<strong>200 g</strong> — 60% more.
					</p>
					<p>
						This is why professional bakers weigh ingredients rather than
						measure by volume. A kitchen scale removes the inconsistency of how
						tightly flour is packed into a measuring cup.
					</p>
					<p>
						The conversions above use real density values (g/ml) for each
						ingredient. Flour is approximately 0.53 g/ml; granulated sugar is
						around 0.85 g/ml; honey is ~1.44 g/ml. The converter above uses
						these same values to calculate weight↔volume conversions in real
						time.
					</p>
				</div>
			</section>
		</div>
	);
}
