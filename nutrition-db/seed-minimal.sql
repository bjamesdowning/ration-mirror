-- TEST-ONLY USDA-shaped smoke seed (~30 foods). Approximate values — NOT App Review data.
-- NEVER promote this file (or a DB filled from it) to production / reviewer nutrition-engine.
-- Apply after schema.sql. Prefer scripts/import-fdc-nutrition.ts for verified Foundation + SR Legacy.

BEGIN TRANSACTION;

INSERT OR REPLACE INTO food (fdc_id, description, data_type) VALUES
	(1001, 'Chicken breast, raw', 'sr_legacy_food'),
	(1002, 'Milk, whole, 3.25% milkfat', 'sr_legacy_food'),
	(1003, 'Wheat flour, white, all-purpose', 'sr_legacy_food'),
	(1004, 'Rice, white, long-grain, raw', 'sr_legacy_food'),
	(1005, 'Onions, raw', 'sr_legacy_food'),
	(1006, 'Oil, olive, salad or cooking', 'sr_legacy_food'),
	(1007, 'Egg, whole, raw, fresh', 'sr_legacy_food'),
	(1008, 'Butter, salted', 'sr_legacy_food'),
	(1009, 'Sugars, granulated', 'sr_legacy_food'),
	(1010, 'Salt, table', 'sr_legacy_food'),
	(1011, 'Tomatoes, red, ripe, raw', 'sr_legacy_food'),
	(1012, 'Potatoes, flesh and skin, raw', 'sr_legacy_food'),
	(1013, 'Pasta, dry, enriched', 'sr_legacy_food'),
	(1014, 'Cheese, cheddar', 'sr_legacy_food'),
	(1015, 'Yogurt, plain, whole milk', 'sr_legacy_food'),
	(1016, 'Oats, raw', 'sr_legacy_food'),
	(1017, 'Bananas, raw', 'sr_legacy_food'),
	(1018, 'Apples, raw, with skin', 'sr_legacy_food'),
	(1019, 'Bread, white, commercially prepared', 'sr_legacy_food'),
	(1020, 'Spinach, raw', 'sr_legacy_food'),
	(1021, 'Garlic, raw', 'sr_legacy_food'),
	(1022, 'Lemons, raw, without peel', 'sr_legacy_food'),
	(1023, 'Beef, ground, 85% lean meat / 15% fat, raw', 'sr_legacy_food'),
	(1024, 'Fish, salmon, Atlantic, farmed, raw', 'sr_legacy_food'),
	(1025, 'Beans, black, mature seeds, raw', 'sr_legacy_food'),
	(1026, 'Lentils, raw', 'sr_legacy_food'),
	(1027, 'Carrots, raw', 'sr_legacy_food'),
	(1028, 'Broccoli, raw', 'sr_legacy_food'),
	(1029, 'Avocados, raw, all commercial varieties', 'sr_legacy_food'),
	(1030, 'Peanut butter, smooth style', 'sr_legacy_food');

-- energy_kcal, protein_g, fat_g, carb_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, salt_g
INSERT OR REPLACE INTO food_nutrient (
	fdc_id, energy_kcal, protein_g, fat_g, carb_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, salt_g
) VALUES
	(1001, 120, 22.5, 2.6, 0.0, 0.0, 0.0, 0.6, 45, 0.11),
	(1002, 61, 3.15, 3.25, 4.8, 0.0, 5.05, 1.86, 43, 0.11),
	(1003, 364, 10.3, 1.0, 76.3, 2.7, 0.3, 0.15, 2, 0.005),
	(1004, 365, 7.1, 0.7, 80.0, 1.3, 0.1, 0.2, 5, 0.013),
	(1005, 40, 1.1, 0.1, 9.3, 1.7, 4.2, 0.04, 4, 0.01),
	(1006, 884, 0.0, 100.0, 0.0, 0.0, 0.0, 13.8, 2, 0.005),
	(1007, 143, 12.6, 9.5, 0.7, 0.0, 0.4, 3.1, 142, 0.36),
	(1008, 717, 0.9, 81.1, 0.1, 0.0, 0.1, 51.4, 643, 1.61),
	(1009, 387, 0.0, 0.0, 100.0, 0.0, 99.8, 0.0, 1, 0.003),
	(1010, 0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 38758, 96.9),
	(1011, 18, 0.9, 0.2, 3.9, 1.2, 2.6, 0.03, 5, 0.013),
	(1012, 77, 2.0, 0.1, 17.5, 2.1, 0.8, 0.03, 6, 0.015),
	(1013, 371, 13.0, 1.5, 74.7, 3.2, 2.7, 0.3, 6, 0.015),
	(1014, 403, 24.9, 33.1, 1.3, 0.0, 0.5, 21.1, 621, 1.55),
	(1015, 61, 3.5, 3.3, 4.7, 0.0, 4.7, 2.1, 46, 0.12),
	(1016, 389, 16.9, 6.9, 66.3, 10.6, 0.0, 1.2, 2, 0.005),
	(1017, 89, 1.1, 0.3, 22.8, 2.6, 12.2, 0.1, 1, 0.003),
	(1018, 52, 0.3, 0.2, 13.8, 2.4, 10.4, 0.03, 1, 0.003),
	(1019, 265, 9.0, 3.2, 49.0, 2.7, 5.0, 0.7, 491, 1.23),
	(1020, 23, 2.9, 0.4, 3.6, 2.2, 0.4, 0.06, 79, 0.2),
	(1021, 149, 6.4, 0.5, 33.1, 2.1, 1.0, 0.09, 17, 0.043),
	(1022, 29, 1.1, 0.3, 9.3, 2.8, 2.5, 0.04, 2, 0.005),
	(1023, 215, 18.6, 15.0, 0.0, 0.0, 0.0, 5.7, 66, 0.17),
	(1024, 208, 20.4, 13.4, 0.0, 0.0, 0.0, 3.1, 59, 0.15),
	(1025, 341, 21.6, 1.4, 62.4, 15.5, 2.1, 0.4, 5, 0.013),
	(1026, 352, 24.6, 1.1, 63.4, 10.7, 2.0, 0.2, 6, 0.015),
	(1027, 41, 0.9, 0.2, 9.6, 2.8, 4.7, 0.04, 69, 0.17),
	(1028, 34, 2.8, 0.4, 6.6, 2.6, 1.7, 0.04, 33, 0.083),
	(1029, 160, 2.0, 14.7, 8.5, 6.7, 0.7, 2.1, 7, 0.018),
	(1030, 588, 25.1, 50.4, 20.0, 6.0, 9.2, 10.1, 429, 1.07);

DELETE FROM food_portion;

INSERT INTO food_portion (fdc_id, modifier, gram_weight, amount, measure_unit) VALUES
	(1001, 'breast, boneless', 174, 1, 'piece'),
	(1002, 'cup', 244, 1, 'cup'),
	(1003, 'cup, sifted', 125, 1, 'cup'),
	(1004, 'cup', 185, 1, 'cup'),
	(1005, 'cup, chopped', 160, 1, 'cup'),
	(1005, 'medium', 110, 1, 'piece'),
	(1006, 'tablespoon', 13.5, 1, 'tbsp'),
	(1007, 'large', 50, 1, 'piece'),
	(1008, 'tablespoon', 14.2, 1, 'tbsp'),
	(1009, 'cup', 200, 1, 'cup'),
	(1009, 'teaspoon', 4.2, 1, 'tsp'),
	(1010, 'teaspoon', 6, 1, 'tsp'),
	(1011, 'medium', 123, 1, 'piece'),
	(1012, 'medium', 213, 1, 'piece'),
	(1013, 'cup, dry', 91, 1, 'cup'),
	(1014, 'slice (1 oz)', 28, 1, 'slice'),
	(1015, 'cup (8 fl oz)', 245, 1, 'cup'),
	(1016, 'cup', 81, 1, 'cup'),
	(1017, 'medium', 118, 1, 'piece'),
	(1018, 'medium', 182, 1, 'piece'),
	(1019, 'slice', 25, 1, 'slice'),
	(1020, 'cup', 30, 1, 'cup'),
	(1021, 'clove', 3, 1, 'clove'),
	(1022, 'fruit without peel', 58, 1, 'piece'),
	(1023, 'oz', 28.35, 1, 'oz'),
	(1024, 'fillet', 178, 1, 'piece'),
	(1025, 'cup', 194, 1, 'cup'),
	(1026, 'cup', 192, 1, 'cup'),
	(1027, 'medium', 61, 1, 'piece'),
	(1028, 'cup, chopped', 91, 1, 'cup'),
	(1029, 'fruit', 201, 1, 'piece'),
	(1030, 'tablespoon', 16, 1, 'tbsp');

-- Rebuild FTS index from food content table
INSERT INTO food_fts(food_fts) VALUES('rebuild');

COMMIT;
