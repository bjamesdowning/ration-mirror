import { getDensityTableForCodegen } from "../app/lib/ingredient-density";

const outputPath = "ios/Ration/Core/Models/IngredientDensity.swift";

function swiftString(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll("\n", "\\n");
}

const densityEntries = Object.entries(getDensityTableForCodegen()).sort(
	([a], [b]) => a.localeCompare(b),
);

const dictionary = densityEntries
	.map(([key, value]) => `        "${swiftString(key)}": ${value},`)
	.join("\n");

const contents = `import Foundation

/// Ingredient density lookup — generated from \`app/lib/ingredient-density.ts\`.
/// Regenerate with \`bun run ios:density\`. Do not edit by hand.
enum IngredientDensity {
    private static let table: [String: Double] = IngredientDensityData.densities

    static func lookup(_ name: String) -> Double? {
        let key = normalize(name)
        return table[key]
    }

    static func convertWithDensity(
        quantity: Double,
        from: String,
        to: String,
        density: Double
    ) -> Double? {
        guard density > 0 else { return nil }
        guard let ml = volumeToMl(quantity, unit: from) else {
            if let grams = weightToGrams(quantity, unit: from),
               let targetMl = volumeToMl(1, unit: to) {
                let mlAmount = grams / density
                return mlAmount / targetMl
            }
            return nil
        }
        let grams = ml * density
        if let targetMl = volumeToMl(1, unit: to) {
            return grams / density / targetMl
        }
        if to == "g" { return grams }
        if to == "kg" { return grams / 1000 }
        return nil
    }

    private static func normalize(_ name: String) -> String {
        name.lowercased()
            .replacingOccurrences(of: "[^a-z0-9\\\\s]", with: " ", options: .regularExpression)
            .split(separator: " ")
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private static func volumeToMl(_ quantity: Double, unit: String) -> Double? {
        UnitConversion.convert(quantity, from: unit, to: "ml")
    }

    private static func weightToGrams(_ quantity: Double, unit: String) -> Double? {
        UnitConversion.convert(quantity, from: unit, to: "g")
    }
}

enum IngredientDensityData {
    static let densities: [String: Double] = [
${dictionary}
    ]
}
`;

await Bun.write(outputPath, contents);
console.info(
	`Wrote ${outputPath} with ${densityEntries.length} density entries.`,
);
