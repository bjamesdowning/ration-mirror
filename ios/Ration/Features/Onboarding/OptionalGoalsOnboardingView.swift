import SwiftUI

/// The same five Nutrition Goals fields, prefilled empty. Skip writes nothing.
struct OptionalGoalsOnboardingView: View {
    @Environment(AppEnvironment.self) private var env
    var goalsEnabled: Bool
    var onFinished: () -> Void

    @State private var dailyEnergyKcal = ""
    @State private var proteinG = ""
    @State private var carbsG = ""
    @State private var fatG = ""
    @State private var fiberG = ""
    @State private var isSaving = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(OptionalGoalsPolicy.draftCopy)
                .font(.title2.bold())
                .foregroundStyle(Theme.carbon)
            Text("Draft, pending review.")
                .font(.caption)
                .foregroundStyle(Theme.muted)
            Text(OptionalGoalsPolicy.notMedical)
                .font(.caption)
                .foregroundStyle(Theme.muted)
            field("kcal / day", text: $dailyEnergyKcal)
            field("Protein g", text: $proteinG)
            field("Carbs g", text: $carbsG)
            field("Fat g", text: $fatG)
            field("Fiber g", text: $fiberG)
            HStack {
                Button("Skip") { onFinished() }
                    .foregroundStyle(Theme.muted)
                Spacer()
                Button(isSaving ? "Saving…" : "Save") {
                    Task { await save() }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isSaving)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.ceramic)
    }

    private func field(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Theme.muted)
            TextField("", text: text)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
        }
    }

    private func save() async {
        guard let write = OptionalGoalsPolicy.write(
            dailyEnergyKcal: dailyEnergyKcal,
            proteinG: proteinG,
            carbsG: carbsG,
            fatG: fatG,
            fiberG: fiberG,
            goalsEnabled: goalsEnabled
        ) else {
            onFinished()
            return
        }
        isSaving = true
        defer { isSaving = false }
        let body = NutritionGoalUpsertRequest(
            dailyEnergyKcal: write.energy,
            proteinG: write.protein,
            carbsG: write.carbs,
            fatG: write.fat,
            fiberG: write.fiber,
            effectiveFrom: ManifestDateHelpers.todayISO()
        )
        _ = try? await env.api.upsertNutritionGoal(body)
        onFinished()
    }
}
