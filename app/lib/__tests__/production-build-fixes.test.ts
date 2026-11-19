import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production build fixes", () => {
	it("keeps ledger.server on the Fuel loader, not the client page", () => {
		const source = readFileSync("app/routes/hub/fuel.tsx", "utf8");
		const client = source.split("export default function FuelPage")[1] ?? "";
		expect(client.length).toBeGreaterThan(0);
		expect(source).toContain('from "~/lib/ledger.server"');
		expect(source).toContain("scanCreditCost: AI_COSTS.SCAN");
		expect(client).not.toContain("ledger.server");
		expect(client).not.toContain("AI_COSTS");
		expect(client).toContain("scanCreditCost={scanCreditCost}");
		expect(client).toContain("creditCost={scanCreditCost}");
		expect(client).toContain(
			"Uses {scanCreditCost} credits per photo. You have {credits}.",
		);
	});

	it("keeps the Eat intent title a compile-time string", () => {
		const intents = readFileSync(
			"ios/RationWidgets/Intents/WidgetIntents.swift",
			"utf8",
		);
		expect(intents).toContain(
			'static var title: LocalizedStringResource = "Eat one"',
		);
		expect(intents).not.toContain("planFuelActions");
		expect(intents).not.toContain("Log to Fuel");
		const eat = readFileSync("ios/RationWidgets/Eat/EatWidget.swift", "utf8");
		expect(eat).toContain('kind: "com.mayutic.ration.eat"');
		expect(eat).toContain('.configurationDisplayName("Eat")');
		expect(eat).toContain("eatWordmark(planFuelActions:");
	});
});
