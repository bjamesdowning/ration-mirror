import type { FaqEntry } from "~/lib/structured-data";

// Copy from Ration Marketing (Oct 2026). Figures checked against
// app/lib/ingredient-density.ts, app/lib/tool-units.ts and app/lib/oven-temperature.ts.
export const UNIT_CONVERTER_FAQ: FaqEntry[] = [
	{
		question: "How many grams are in a cup of flour?",
		answer:
			"About 125 g for all-purpose flour, spooned and leveled. Bread and cake flour come out around 120 g. Scooping straight from the bag can add 20 to 30 g, which is why weighing is more reliable.",
	},
	{
		question: "How many grams are in a cup of sugar?",
		answer:
			"About 200 g for granulated sugar. Packed brown sugar is about 213 g, and powdered sugar is around 113 g.",
	},
	{
		question: "What's the difference between oz and fl oz?",
		answer:
			"An ounce (oz) measures weight, while a fluid ounce (fl oz) measures volume. They only match for water and liquids with a similar density. For example, a fluid ounce of honey weighs about 1.5 oz, and a fluid ounce of flour weighs about 0.5 oz. A US fl oz is 29.6 ml and a UK fl oz is 28.4 ml.",
	},
	{
		question: "How many ml are in a tablespoon?",
		answer:
			"A US tablespoon is 14.8 ml, which most recipes round to 15 ml. An Australian tablespoon is 20 ml. There are 3 teaspoons in a tablespoon.",
	},
	{
		question: "Is a cup the same in the US, UK and Australia?",
		answer:
			"No. A US cup is 236.6 ml, while a metric cup (used in the UK, Australia, Canada and New Zealand) is 250 ml. Pints differ more: a US pint is 473 ml and a UK pint is 568 ml, about 20% larger.",
	},
	{
		question: "How much is a stick of butter?",
		answer:
			"One US stick is ½ cup, which is 8 tablespoons or about 113 g. Four sticks make a pound.",
	},
	{
		question: "How do I convert oven temperatures for a fan oven?",
		answer:
			"Lower the conventional temperature by about 20°C (25°F). For example, 180°C conventional is about 160°C fan. 180°C is also 350°F, or gas mark 4.",
	},
	{
		question: "Why should I weigh baking ingredients instead of using cups?",
		answer:
			"Cups measure volume, and how much an ingredient weighs per cup depends on how tightly it's packed. Weighing gives you the same result every time, which matters most for flour in bread and cakes.",
	},
];

export function UnitConverterFaq() {
	return (
		<section
			aria-labelledby="converter-faq"
			className="glass-panel rounded-2xl p-6 md:p-8"
		>
			<div className="w-6 h-[3px] bg-hyper-green rounded-full mb-4" />
			<h2 id="converter-faq" className="text-display text-lg text-carbon mb-4">
				Frequently asked questions
			</h2>
			<div className="divide-y divide-carbon/10">
				{UNIT_CONVERTER_FAQ.map((entry) => (
					<details key={entry.question} className="group py-3">
						<summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 py-1 font-bold text-sm text-carbon">
							<h3 className="text-sm">{entry.question}</h3>
							<span
								aria-hidden
								className="text-hyper-green transition-transform group-open:rotate-45"
							>
								+
							</span>
						</summary>
						<p className="mt-2 text-sm text-muted leading-relaxed">
							{entry.answer}
						</p>
					</details>
				))}
			</div>
		</section>
	);
}
