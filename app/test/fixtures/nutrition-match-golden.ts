/**
 * Golden matcher cases for nutrition food-name ranking regression tests.
 * Target: ≥300 reviewed-style cases including ≥100 intentional abstentions.
 */
import type { FoodMatchCandidate } from "~/lib/nutrition/rank-food-match";

export type NutritionMatchGoldenCase = {
	id: string;
	query: string;
	candidates: FoodMatchCandidate[];
	expectedFdcId: number | null;
	/** When set, assert autoAccept on the winner (positive cases only). */
	expectAutoAccept?: boolean;
	note?: string;
};

const CURATED: NutritionMatchGoldenCase[] = [
	{
		id: "milk-dairy-vs-chocolate",
		query: "milk",
		note: "Must abstain from milk chocolate / granola coatings",
		candidates: [
			{
				fdcId: 9001,
				description:
					"Snacks, granola bars, soft, coated, milk chocolate coating, chocolate chip",
			},
			{
				fdcId: 1097510,
				description: "Milk, whole, 3.25% milkfat, with added vitamin D",
				dataType: "foundation_food",
			},
			{ fdcId: 9003, description: "Candies, milk chocolate" },
		],
		expectedFdcId: 1097510,
	},
	{
		id: "milk-chocolate-abstain",
		query: "milk",
		note: "All candidates are abstained — return null",
		candidates: [
			{ fdcId: 9003, description: "Candies, milk chocolate" },
			{
				fdcId: 9004,
				description:
					"Snacks, granola bars, soft, coated, milk chocolate coating",
			},
			{ fdcId: 9005, description: "Crackers, milk" },
		],
		expectedFdcId: null,
	},
	{
		id: "butter-vs-peanut-butter",
		query: "butter",
		candidates: [
			{ fdcId: 8001, description: "Peanut butter, smooth style" },
			{ fdcId: 8002, description: "Butter, salted" },
		],
		expectedFdcId: 8002,
	},
	{
		id: "ocr-whole-milk-auto",
		query: "whole milk",
		note: "OCR inverted label must auto-accept Foundation whole milk",
		candidates: [
			{
				fdcId: 1097510,
				description: "Milk, whole, 3.25% milkfat, with added vitamin D",
				dataType: "foundation_food",
			},
			{
				fdcId: 9002,
				description:
					"Milk, lowfat, 1% milkfat, with added vitamin A and vitamin D",
			},
			{
				fdcId: 9001,
				description: "Beverages, almond milk, unsweetened, shelf stable",
			},
		],
		expectedFdcId: 1097510,
		expectAutoAccept: true,
	},
	{
		id: "ocr-organic-whole-milk-medium",
		query: "organic whole milk",
		note: "Organic qualifier → medium USDA attach to whole milk (not abstain)",
		candidates: [
			{
				fdcId: 1097510,
				description: "Milk, whole, 3.25% milkfat, with added vitamin D",
			},
			{
				fdcId: 9001,
				description: "Beverages, almond milk, unsweetened, shelf stable",
			},
		],
		expectedFdcId: 1097510,
		expectAutoAccept: false,
	},
	{
		id: "olive-oil-primary",
		query: "olive oil",
		candidates: [
			{ fdcId: 7001, description: "Oil, olive, salad or cooking" },
			{ fdcId: 7002, description: "Oil, vegetable, soybean" },
		],
		expectedFdcId: 7001,
	},
	{
		id: "almond-milk-vs-dairy",
		query: "almond milk",
		candidates: [
			{ fdcId: 1, description: "Milk, whole, 3.25% milkfat" },
			{
				fdcId: 2,
				description: "Beverages, almond milk, unsweetened, shelf stable",
			},
		],
		expectedFdcId: 2,
	},
	{
		id: "chicken-breast-raw",
		query: "chicken breast",
		candidates: [
			{
				fdcId: 1,
				description: "Chicken, broilers or fryers, breast, meat only, raw",
			},
			{ fdcId: 2, description: "Soup, chicken noodle, canned, condensed" },
		],
		expectedFdcId: 1,
	},
	{
		id: "flour-all-purpose",
		query: "flour",
		candidates: [
			{ fdcId: 1, description: "Wheat flour, white, all-purpose, enriched" },
			{ fdcId: 2, description: "Snacks, corn-based, extruded, chips, plain" },
		],
		expectedFdcId: 1,
	},
];

/** Positive primary-label foods used to expand the golden set. */
const POSITIVE_FOODS: Array<{
	slug: string;
	query: string;
	description: string;
	dataType?: string;
}> = [
	{ slug: "egg", query: "egg", description: "Egg, whole, raw, fresh" },
	{ slug: "banana", query: "banana", description: "Bananas, raw" },
	{ slug: "apple", query: "apple", description: "Apples, raw, with skin" },
	{ slug: "rice", query: "rice", description: "Rice, white, long-grain, raw" },
	{ slug: "oats", query: "oats", description: "Oats, raw" },
	{ slug: "spinach", query: "spinach", description: "Spinach, raw" },
	{ slug: "carrot", query: "carrot", description: "Carrots, raw" },
	{ slug: "broccoli", query: "broccoli", description: "Broccoli, raw" },
	{ slug: "tomato", query: "tomato", description: "Tomatoes, red, ripe, raw" },
	{
		slug: "potato",
		query: "potato",
		description: "Potatoes, flesh and skin, raw",
	},
	{ slug: "garlic", query: "garlic", description: "Garlic, raw" },
	{ slug: "onion", query: "onion", description: "Onions, raw" },
	{ slug: "lemon", query: "lemon", description: "Lemons, raw, without peel" },
	{
		slug: "avocado",
		query: "avocado",
		description: "Avocados, raw, all commercial varieties",
	},
	{ slug: "cheddar", query: "cheddar", description: "Cheese, cheddar" },
	{ slug: "yogurt", query: "yogurt", description: "Yogurt, plain, whole milk" },
	{
		slug: "salmon",
		query: "salmon",
		description: "Fish, salmon, Atlantic, farmed, raw",
	},
	{
		slug: "beef",
		query: "ground beef",
		description: "Beef, ground, 85% lean meat / 15% fat, raw",
	},
	{ slug: "lentils", query: "lentils", description: "Lentils, raw" },
	{
		slug: "black-beans",
		query: "black beans",
		description: "Beans, black, mature seeds, raw",
	},
	{ slug: "pasta", query: "pasta", description: "Pasta, dry, enriched" },
	{
		slug: "bread",
		query: "bread",
		description: "Bread, white, commercially prepared",
	},
	{ slug: "sugar", query: "sugars", description: "Sugars, granulated" },
	{ slug: "salt", query: "salt", description: "Salt, table" },
	{ slug: "butter-salted", query: "butter", description: "Butter, salted" },
	{
		slug: "olive-oil",
		query: "olive oil",
		description: "Oil, olive, salad or cooking",
	},
	{
		slug: "soy-sauce",
		query: "soy sauce",
		description: "Soy sauce made from soy and wheat (shoyu)",
	},
	{ slug: "honey", query: "honey", description: "Honey" },
	{ slug: "maple", query: "maple syrup", description: "Syrups, maple" },
	{
		slug: "cocoa",
		query: "cocoa",
		description: "Cocoa, dry powder, unsweetened",
	},
	{ slug: "walnut", query: "walnuts", description: "Nuts, walnuts, english" },
	{ slug: "almond", query: "almonds", description: "Nuts, almonds" },
	{ slug: "peanut", query: "peanuts", description: "Peanuts, all types, raw" },
	{
		slug: "tuna",
		query: "tuna",
		description: "Fish, tuna, fresh, bluefin, raw",
	},
	{
		slug: "shrimp",
		query: "shrimp",
		description: "Crustaceans, shrimp, mixed species, raw",
	},
	{
		slug: "tofu",
		query: "tofu",
		description: "Tofu, raw, firm, prepared with calcium sulfate",
	},
	{ slug: "quinoa", query: "quinoa", description: "Quinoa, uncooked" },
	{ slug: "couscous", query: "couscous", description: "Couscous, dry" },
	{ slug: "barley", query: "barley", description: "Barley, pearled, raw" },
	{ slug: "corn", query: "corn", description: "Corn, sweet, yellow, raw" },
	{ slug: "peas", query: "peas", description: "Peas, green, raw" },
	{
		slug: "cucumber",
		query: "cucumber",
		description: "Cucumber, with peel, raw",
	},
	{ slug: "celery", query: "celery", description: "Celery, raw" },
	{ slug: "pepper", query: "peppers", description: "Peppers, sweet, red, raw" },
	{
		slug: "mushroom",
		query: "mushrooms",
		description: "Mushrooms, white, raw",
	},
	{
		slug: "zucchini",
		query: "zucchini",
		description: "Squash, summer, zucchini, includes skin, raw",
	},
	{
		slug: "sweet-potato",
		query: "sweet potato",
		description: "Sweet potato, raw, unprepared",
	},
	{ slug: "cabbage", query: "cabbage", description: "Cabbage, raw" },
	{ slug: "kale", query: "kale", description: "Kale, raw" },
	{
		slug: "lettuce",
		query: "lettuce",
		description: "Lettuce, cos or romaine, raw",
	},
	{
		slug: "orange",
		query: "orange",
		description: "Oranges, raw, all commercial varieties",
	},
	{ slug: "grape", query: "grapes", description: "Grapes, red or green, raw" },
	{ slug: "strawberry", query: "strawberry", description: "Strawberries, raw" },
	{ slug: "blueberry", query: "blueberry", description: "Blueberries, raw" },
	{ slug: "raspberry", query: "raspberry", description: "Raspberries, raw" },
	{ slug: "mango", query: "mango", description: "Mangos, raw" },
	{
		slug: "pineapple",
		query: "pineapple",
		description: "Pineapple, raw, all varieties",
	},
	{ slug: "watermelon", query: "watermelon", description: "Watermelon, raw" },
	{
		slug: "pork",
		query: "pork chop",
		description:
			"Pork, fresh, loin, center loin (chops), bone-in, separable lean only, raw",
	},
	{
		slug: "turkey",
		query: "turkey",
		description: "Turkey, whole, meat only, raw",
	},
	{
		slug: "bacon",
		query: "bacon",
		description: "Pork, cured, bacon, unprepared",
	},
	{
		slug: "ham",
		query: "ham",
		description:
			"Pork, cured, ham, boneless, extra lean (approximately 5% fat), roasted",
	},
	{
		slug: "sausage",
		query: "sausage",
		description: "Sausage, pork, fresh, raw",
	},
	{
		slug: "cream",
		query: "cream",
		description: "Cream, fluid, heavy whipping",
	},
	{
		slug: "sour-cream",
		query: "sour cream",
		description: "Cream, sour, cultured",
	},
	{
		slug: "mozzarella",
		query: "mozzarella",
		description: "Cheese, mozzarella, whole milk",
	},
	{
		slug: "parmesan",
		query: "parmesan",
		description: "Cheese, parmesan, hard",
	},
	{
		slug: "cottage",
		query: "cottage cheese",
		description: "Cheese, cottage, creamed, large or small curd",
	},
	{
		slug: "skim-milk",
		query: "skim milk",
		description:
			"Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)",
	},
	{
		slug: "foundation-milk",
		query: "milk",
		description: "Milk, whole, 3.25% milkfat",
		dataType: "foundation_food",
	},
	{ slug: "coconut-oil", query: "coconut oil", description: "Oil, coconut" },
	{ slug: "canola", query: "canola oil", description: "Oil, canola" },
	{ slug: "sesame", query: "sesame oil", description: "Oil, sesame" },
	{ slug: "vinegar", query: "vinegar", description: "Vinegar, distilled" },
	{
		slug: "mustard",
		query: "mustard",
		description: "Mustard, prepared, yellow",
	},
	{ slug: "ketchup", query: "catsup", description: "Catsup" },
	{
		slug: "mayo",
		query: "mayonnaise",
		description: "Salad dressing, mayonnaise, regular",
	},
	{ slug: "hummus", query: "hummus", description: "Hummus, commercial" },
	{
		slug: "salsa",
		query: "salsa",
		description: "Sauce, salsa, ready-to-serve",
	},
	{
		slug: "broth",
		query: "soup stock chicken",
		description: "Soup, stock, chicken, home-prepared",
	},
	{
		slug: "coconut-milk",
		query: "coconut milk",
		description:
			"Nuts, coconut milk, raw (liquid expressed from grated meat and water)",
	},
	{
		slug: "soy-milk",
		query: "soymilk",
		description: "Soymilk, original and vanilla, unfortified",
	},
	{
		slug: "oat-milk",
		query: "oat milk",
		description: "Beverages, oat milk, unsweetened",
	},
	{
		slug: "chia",
		query: "chia seeds",
		description: "Seeds, chia seeds, dried",
	},
	{ slug: "flax", query: "flaxseed", description: "Seeds, flaxseed" },
	{
		slug: "sunflower",
		query: "sunflower seeds",
		description: "Seeds, sunflower seed kernels, dried",
	},
	{
		slug: "pumpkin-seed",
		query: "pumpkin seeds",
		description: "Seeds, pumpkin and squash seed kernels, dried",
	},
	{ slug: "dates", query: "dates", description: "Dates, medjool" },
	{ slug: "raisins", query: "raisins", description: "Raisins, seedless" },
	{
		slug: "chocolate",
		query: "dark chocolate",
		description: "Candies, chocolate, dark, 70-85% cacao solids",
	},
	{
		slug: "coffee",
		query: "coffee",
		description: "Beverages, coffee, brewed, breakfast blend",
	},
	{
		slug: "tea",
		query: "tea",
		description: "Beverages, tea, black, brewed, prepared with tap water",
	},
	{
		slug: "wine",
		query: "red wine",
		description: "Alcoholic beverage, wine, table, red",
	},
	{
		slug: "beer",
		query: "beer",
		description: "Alcoholic beverage, beer, regular, all",
	},
	{
		slug: "flour-ww",
		query: "wheat flour",
		description: "Wheat flour, whole-grain",
	},
	{
		slug: "cornmeal",
		query: "cornmeal",
		description: "Cornmeal, whole-grain, yellow",
	},
	{
		slug: "polenta",
		query: "cornmeal",
		description: "Cornmeal, degermed, enriched, yellow",
	},
	{ slug: "basil", query: "basil", description: "Spices, basil, dried" },
	{ slug: "oregano", query: "oregano", description: "Spices, oregano, dried" },
	{ slug: "cumin", query: "cumin", description: "Spices, cumin seed" },
	{
		slug: "cinnamon",
		query: "cinnamon",
		description: "Spices, cinnamon, ground",
	},
	{ slug: "paprika", query: "paprika", description: "Spices, paprika" },
	{
		slug: "black-pepper",
		query: "black pepper",
		description: "Spices, pepper, black",
	},
	{ slug: "ginger", query: "ginger", description: "Spices, ginger, ground" },
	{
		slug: "turmeric",
		query: "turmeric",
		description: "Spices, turmeric, ground",
	},
	{ slug: "chili", query: "chili powder", description: "Spices, chili powder" },
	{ slug: "vanilla", query: "vanilla", description: "Vanilla extract" },
	{
		slug: "baking-soda",
		query: "baking soda",
		description: "Leavening agents, baking soda",
	},
	{
		slug: "baking-powder",
		query: "baking powder",
		description:
			"Leavening agents, baking powder, double-acting, sodium aluminum sulfate",
	},
	{
		slug: "yeast",
		query: "yeast",
		description: "Leavening agents, yeast, baker's, active dry",
	},
	{ slug: "cornstarch", query: "cornstarch", description: "Cornstarch" },
	{
		slug: "gelatin",
		query: "gelatin",
		description: "Gelatins, dry powder, unsweetened",
	},
	{ slug: "asparagus", query: "asparagus", description: "Asparagus, raw" },
	{
		slug: "green-bean",
		query: "green beans",
		description: "Beans, snap, green, raw",
	},
	{ slug: "eggplant", query: "eggplant", description: "Eggplant, raw" },
	{
		slug: "cauliflower",
		query: "cauliflower",
		description: "Cauliflower, raw",
	},
	{
		slug: "brussels",
		query: "brussels sprouts",
		description: "Brussels sprouts, raw",
	},
	{ slug: "beet", query: "beets", description: "Beets, raw" },
	{ slug: "radish", query: "radish", description: "Radishes, raw" },
	{ slug: "turnip", query: "turnip", description: "Turnips, raw" },
	{ slug: "pear", query: "pear", description: "Pears, raw" },
	{ slug: "peach", query: "peach", description: "Peaches, yellow, raw" },
	{ slug: "plum", query: "plum", description: "Plums, raw" },
	{ slug: "cherry", query: "cherry", description: "Cherries, sweet, raw" },
	{ slug: "kiwi", query: "kiwifruit", description: "Kiwifruit, green, raw" },
	{ slug: "lime", query: "lime", description: "Limes, raw" },
	{
		slug: "grapefruit",
		query: "grapefruit",
		description: "Grapefruit, raw, pink and red, all areas",
	},
	{ slug: "coconut", query: "coconut", description: "Nuts, coconut meat, raw" },
	{
		slug: "cashew",
		query: "cashew nuts",
		description: "Nuts, cashew nuts, raw",
	},
	{
		slug: "pistachio",
		query: "pistachio nuts",
		description: "Nuts, pistachio nuts, raw",
	},
	{ slug: "pecan", query: "pecans", description: "Nuts, pecans" },
	{
		slug: "hazelnut",
		query: "hazelnuts",
		description: "Nuts, hazelnuts or filberts",
	},
	{ slug: "cod", query: "cod", description: "Fish, cod, Atlantic, raw" },
	{ slug: "tilapia", query: "tilapia", description: "Fish, tilapia, raw" },
	{ slug: "crab", query: "crab", description: "Crustaceans, crab, blue, raw" },
	{
		slug: "lobster",
		query: "lobster",
		description: "Crustaceans, lobster, northern, raw",
	},
	{
		slug: "scallop",
		query: "scallop",
		description: "Mollusks, scallop, mixed species, raw",
	},
	{
		slug: "clam",
		query: "clam",
		description: "Mollusks, clam, mixed species, raw",
	},
	{
		slug: "mussel",
		query: "mussel",
		description: "Mollusks, mussel, blue, raw",
	},
	{
		slug: "lamb",
		query: "lamb",
		description:
			'Lamb, domestic, leg, whole (shank and sirloin), separable lean only, trimmed to 1/4" fat, choice, raw',
	},
	{
		slug: "veal",
		query: "veal",
		description: "Veal, leg (top round), separable lean only, raw",
	},
	{
		slug: "duck",
		query: "duck",
		description: "Duck, domesticated, meat only, raw",
	},
	{
		slug: "goose",
		query: "goose",
		description: "Goose, domesticated, meat only, raw",
	},
	{ slug: "venison", query: "deer", description: "Game meat, deer, raw" },
	{
		slug: "rabbit",
		query: "rabbit",
		description: "Game meat, rabbit, wild, raw",
	},
	{ slug: "tempeh", query: "tempeh", description: "Tempeh" },
	{
		slug: "seitan",
		query: "vital wheat gluten",
		description: "Vital wheat gluten",
	},
	{ slug: "miso", query: "miso", description: "Miso" },
	{
		slug: "kimchi",
		query: "pickle cucumber",
		description: "Pickle, cucumber, sour",
	},
	{
		slug: "sauerkraut",
		query: "sauerkraut",
		description: "Sauerkraut, canned, solids and liquids",
	},
	{
		slug: "pickles",
		query: "pickles",
		description: "Pickles, cucumber, dill or kosher dill",
	},
	{
		slug: "olives",
		query: "olives",
		description: "Olives, ripe, canned (small-extra large)",
	},
	{ slug: "capers", query: "capers", description: "Capers, canned" },
	{
		slug: "anchovy",
		query: "anchovy",
		description: "Fish, anchovy, european, canned in oil, drained solids",
	},
	{
		slug: "sardine",
		query: "sardine",
		description:
			"Fish, sardine, Atlantic, canned in oil, drained solids with bone",
	},
	{
		slug: "mackerel",
		query: "mackerel",
		description: "Fish, mackerel, atlantic, raw",
	},
	{
		slug: "trout",
		query: "trout",
		description: "Fish, trout, rainbow, farmed, raw",
	},
	{
		slug: "halibut",
		query: "halibut",
		description: "Fish, halibut, Atlantic and Pacific, raw",
	},
	{
		slug: "sole",
		query: "sole",
		description: "Fish, flatfish (flounder and sole species), raw",
	},
	{
		slug: "ricotta",
		query: "ricotta",
		description: "Cheese, ricotta, whole milk",
	},
	{ slug: "feta", query: "feta", description: "Cheese, feta" },
	{ slug: "brie", query: "brie", description: "Cheese, brie" },
	{ slug: "gouda", query: "gouda", description: "Cheese, gouda" },
	{ slug: "swiss", query: "swiss cheese", description: "Cheese, swiss" },
	{ slug: "cream-cheese", query: "cream cheese", description: "Cheese, cream" },
	{
		slug: "half-half",
		query: "half and half",
		description: "Cream, fluid, half and half",
	},
	{
		slug: "buttermilk",
		query: "buttermilk",
		description: "Milk, buttermilk, fluid, cultured, lowfat",
	},
	{
		slug: "evaporated",
		query: "evaporated milk",
		description:
			"Milk, canned, evaporated, without added vitamin A and vitamin D",
	},
	{
		slug: "condensed",
		query: "condensed milk",
		description: "Milk, canned, condensed, sweetened",
	},
	{
		slug: "powdered-milk",
		query: "milk dry",
		description: "Milk, dry, whole, without added vitamin D",
	},
	{
		slug: "whey",
		query: "whey protein",
		description: "Beverages, Protein powder whey based",
	},
	{
		slug: "protein-bar",
		query: "granola bars",
		description: "Snacks, granola bars, hard, chocolate chip",
	},
	{
		slug: "granola",
		query: "granola",
		description: "Cereals ready-to-eat, granola, homemade",
	},
	{
		slug: "oatmeal",
		query: "oats",
		description: "Cereals, oats, regular and quick, not fortified, dry",
	},
	{
		slug: "cornflakes",
		query: "corn flakes",
		description: "Cereals ready-to-eat, KELLOGG, KELLOGG'S Corn Flakes",
	},
	{
		slug: "rice-cakes",
		query: "rice cakes",
		description: "Snacks, rice cakes, brown rice, plain",
	},
	{
		slug: "tortilla",
		query: "tortilla",
		description: "Tortillas, ready-to-bake or -fry, corn",
	},
	{ slug: "pita", query: "pita", description: "Bread, pita, white, enriched" },
	{
		slug: "bagel",
		query: "bagel",
		description:
			"Bagels, plain, enriched, with calcium propionate (includes onion, poppy, sesame)",
	},
	{
		slug: "english-muffin",
		query: "english muffin",
		description:
			"English muffins, plain, enriched, with calcium propionate (includes sourdough)",
	},
	{ slug: "croissant", query: "croissant", description: "Croissants, butter" },
	{
		slug: "pancake",
		query: "pancake",
		description: "Pancakes, plain, dry mix, incomplete (includes buttermilk)",
	},
	{
		slug: "waffle",
		query: "waffle",
		description: "Waffles, plain, frozen, ready-to-heat",
	},
	{ slug: "syrup", query: "corn syrup", description: "Syrups, corn, light" },
	{ slug: "molasses", query: "molasses", description: "Molasses" },
	{ slug: "jam", query: "jams", description: "Jams and preserves" },
	{
		slug: "peanut-butter",
		query: "peanut butter",
		description: "Peanut butter, smooth style, without salt",
	},
	{
		slug: "almond-butter",
		query: "almond butter",
		description: "Nuts, almond butter, plain, without salt added",
	},
	{
		slug: "tahini",
		query: "tahini",
		description:
			"Seeds, sesame butter, tahini, from roasted and toasted kernels (most common type)",
	},
	{
		slug: "nutella",
		query: "hazelnut spread",
		description: "Chocolate-flavored hazelnut spread",
	},
];

const DISTRACTORS: FoodMatchCandidate[] = [
	{ fdcId: 99001, description: "Candies, milk chocolate" },
	{
		fdcId: 99002,
		description: "Snacks, granola bars, soft, milk chocolate coating",
	},
	{ fdcId: 99003, description: "Soup, chicken noodle, canned, condensed" },
	{
		fdcId: 99004,
		description: "Beverages, almond milk, unsweetened, shelf stable",
	},
	{ fdcId: 99005, description: "Crackers, milk" },
	{ fdcId: 99006, description: "Dessert, pudding, chocolate, dry mix" },
	{ fdcId: 99007, description: "Babyfood, juice, apple and grape" },
	{ fdcId: 99008, description: "Fast foods, burrito, with beans and cheese" },
];

const ABSTENTION_QUERIES: Array<{
	slug: string;
	query: string;
	candidates: FoodMatchCandidate[];
	note: string;
}> = [
	{
		slug: "milk-candy-only",
		query: "milk",
		note: "fragile head — candy only",
		candidates: [
			{ fdcId: 1, description: "Candies, milk chocolate" },
			{ fdcId: 2, description: "Crackers, milk" },
		],
	},
	{
		slug: "butter-nut-only",
		query: "butter",
		note: "peanut butter is not butter",
		candidates: [
			{ fdcId: 1, description: "Peanut butter, smooth style" },
			{ fdcId: 2, description: "Almond butter, plain" },
		],
	},
	{
		slug: "cream-dessert",
		query: "cream",
		note: "ice cream / dessert abstain without dairy cream primary",
		candidates: [
			{ fdcId: 1, description: "Ice creams, vanilla" },
			{ fdcId: 2, description: "Candies, white chocolate" },
		],
	},
	{
		slug: "yogurt-covered",
		query: "yogurt",
		note: "yogurt-covered raisins are not yogurt",
		candidates: [
			{ fdcId: 1, description: "Snacks, yogurt raisins" },
			{ fdcId: 2, description: "Candies, yogurt covered" },
		],
	},
	{
		slug: "ocr-gibberish",
		query: "xzq milkfoil 99",
		note: "OCR noise",
		candidates: [
			{ fdcId: 1, description: "Milk, whole, 3.25% milkfat" },
			{ fdcId: 2, description: "Oil, olive, salad or cooking" },
		],
	},
	{
		slug: "branded-mystery",
		query: "chef special sauce",
		note: "branded / recipe name abstain",
		candidates: [
			{
				fdcId: 1,
				description: "Sauce, pasta, spaghetti/marinara, ready-to-serve",
			},
			{ fdcId: 2, description: "Soup, tomato, canned, condensed" },
		],
	},
	{
		slug: "chicken-soup-only",
		query: "chicken breast",
		note: "query needs breast; soup-only bank abstains",
		candidates: [
			{ fdcId: 1, description: "Soup, chicken noodle, canned, condensed" },
			{ fdcId: 2, description: "Soup, chicken broth, canned, condensed" },
			{ fdcId: 3, description: "Soup, stock, chicken, home-prepared" },
		],
	},
];

function buildGeneratedCases(): NutritionMatchGoldenCase[] {
	const cases: NutritionMatchGoldenCase[] = [];

	for (let i = 0; i < POSITIVE_FOODS.length; i++) {
		const food = POSITIVE_FOODS[i];
		if (!food) continue;
		const fdcId = 100000 + i;
		const distractor = DISTRACTORS[i % DISTRACTORS.length];
		const second = DISTRACTORS[(i + 3) % DISTRACTORS.length];
		cases.push({
			id: `pos-${food.slug}`,
			query: food.query,
			note: "primary-label positive",
			candidates: [
				{
					fdcId,
					description: food.description,
					dataType: food.dataType,
				},
				...(distractor ? [distractor] : []),
				...(second ? [{ ...second, fdcId: second.fdcId + 1000 }] : []),
			],
			expectedFdcId: fdcId,
		});
	}

	// Expand abstentions to ≥100 by rotating fragile heads against candy/snack banks.
	const fragileHeads = ["milk", "butter", "cream", "yogurt"];
	const badEmbeds = [
		"Candies, milk chocolate",
		"Snacks, granola bars, soft, coated, milk chocolate coating",
		"Crackers, milk",
		"Dessert, pudding, chocolate, ready-to-eat",
		"Babyfood, snack, gerber, graduate, lil crunchies, baked whole grain corn snack",
		"Cookies, chocolate chip, commercially prepared",
		"Ice creams, chocolate",
		"Candies, caramels",
		"Snacks, corn-based, extruded, chips, barbecue-flavor",
		"Fast foods, potato, french fried in vegetable oil",
	];
	let abstainIdx = 0;
	for (const head of fragileHeads) {
		for (let i = 0; i < badEmbeds.length; i++) {
			for (let j = i + 1; j < badEmbeds.length; j++) {
				cases.push({
					id: `abs-${head}-${abstainIdx}`,
					query: head,
					note: "intentional abstention — hard semantic conflict",
					candidates: [
						{
							fdcId: 200000 + abstainIdx,
							description: badEmbeds[i] ?? "Candies",
						},
						{
							fdcId: 300000 + abstainIdx,
							description: badEmbeds[j] ?? "Snacks",
						},
					],
					expectedFdcId: null,
				});
				abstainIdx += 1;
				if (abstainIdx >= 100) break;
			}
			if (abstainIdx >= 100) break;
		}
		if (abstainIdx >= 100) break;
	}

	for (const abs of ABSTENTION_QUERIES) {
		cases.push({
			id: `abs-curated-${abs.slug}`,
			query: abs.query,
			note: abs.note,
			candidates: abs.candidates,
			expectedFdcId: null,
		});
	}

	return cases;
}

export const NUTRITION_MATCH_GOLDEN_CASES: NutritionMatchGoldenCase[] = [
	...CURATED,
	...buildGeneratedCases(),
];
