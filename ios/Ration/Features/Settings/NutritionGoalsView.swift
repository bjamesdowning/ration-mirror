import SwiftUI
import Observation

@MainActor
@Observable
final class NutritionGoalsViewModel {
    private(set) var goal: NutritionGoal?
    private(set) var summary: NutritionSummary?
    private(set) var isLoading = false
    private(set) var isSaving = false
    var errorMessage: String?
    var isUnavailable = false

    var dailyEnergyKcal: String = ""
    var proteinG: String = ""
    var carbsG: String = ""
    var fatG: String = ""
    var fiberG: String = ""

    var hasAnyValue: Bool {
        [dailyEnergyKcal, proteinG, carbsG, fatG, fiberG].contains { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    /// Sparse server days backfilled to a contiguous 7-day window for the chart.
    var filledDays: [NutritionDayTotals] {
        guard let summary else { return [] }
        return NutritionDayFill.fillSparseDays(from: summary.from, to: summary.to, days: summary.days)
    }

    var ratios: NutritionGoalProgress.Ratios? {
        guard let summary else { return nil }
        return NutritionGoalProgress.ratios(totals: summary.totals, goal: summary.goal)
    }

    func load(api: RationAPI) async {
        isLoading = true
        errorMessage = nil
        isUnavailable = false
        defer { isLoading = false }
        do {
            let response = try await api.nutritionGoal()
            applyGoal(response.goal)
        } catch let apiError as APIError where apiError.isFeatureDisabled {
            isUnavailable = true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        await loadSummary(api: api)
    }

    private func loadSummary(api: RationAPI) async {
        let today = ManifestDateHelpers.todayISO()
        let from = ManifestDateHelpers.addDays(today, days: -6)
        do {
            summary = try await api.nutritionSummary(from: from, to: today)
        } catch {
            // Weekly chart is supplementary — never block goal editing on it.
        }
    }

    private func applyGoal(_ goal: NutritionGoal?) {
        self.goal = goal
        dailyEnergyKcal = goal?.dailyEnergyKcal.map(Self.formatWhole) ?? ""
        proteinG = goal?.proteinG.map(Self.formatWhole) ?? ""
        carbsG = goal?.carbsG.map(Self.formatWhole) ?? ""
        fatG = goal?.fatG.map(Self.formatWhole) ?? ""
        fiberG = goal?.fiberG.map(Self.formatWhole) ?? ""
    }

    private static func formatWhole(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
    }

    /// Empty / whitespace → nil; keep 0 as an explicit target.
    private static func parseOptional(_ raw: String) -> Double? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != "—" else { return nil }
        return Double(trimmed)
    }

    func save(api: RationAPI) async -> Bool {
        guard hasAnyValue else {
            errorMessage = "Set at least one nutrient target."
            return false
        }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let body = NutritionGoalUpsertRequest(
                dailyEnergyKcal: Self.parseOptional(dailyEnergyKcal),
                proteinG: Self.parseOptional(proteinG),
                carbsG: Self.parseOptional(carbsG),
                fatG: Self.parseOptional(fatG),
                fiberG: Self.parseOptional(fiberG),
                effectiveFrom: ManifestDateHelpers.todayISO(),
                // Server records first-use goals consent; idempotent to re-send on every edit.
                consent: true
            )
            let response = try await api.upsertNutritionGoal(body)
            applyGoal(response.goal)
            await loadSummary(api: api)
            return true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }

    func clear(api: RationAPI) async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let response = try await api.clearNutritionGoal()
            applyGoal(response.goal)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

/// Personal nutrition targets — Settings-only. Fiber lives here, not on Manifest strips
/// (`ration-master` directive), since it's a goal input rather than a per-meal actual.
struct NutritionGoalsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = NutritionGoalsViewModel()
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case energy, protein, carbs, fat, fiber
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.goal == nil {
                    LoadingView()
                } else if model.isUnavailable {
                    EmptyStateView(
                        icon: "target",
                        title: "Nutrition goals aren't available yet",
                        message: "This feature is rolling out gradually — check back soon."
                    )
                } else {
                    form
                }
            }
            .navigationTitle("Nutrition Goals")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .background(Theme.ceramic)
        }
        .task { await model.load(api: env.api) }
    }

    private var form: some View {
        Form {
            Section {
                targetField("Daily calories", text: $model.dailyEnergyKcal, suffix: "kcal", field: .energy)
                targetField("Protein", text: $model.proteinG, suffix: "g", field: .protein)
                targetField("Carbs", text: $model.carbsG, suffix: "g", field: .carbs)
                targetField("Fat", text: $model.fatG, suffix: "g", field: .fat)
                targetField("Fiber", text: $model.fiberG, suffix: "g", field: .fiber)
            } header: {
                Text("Daily targets")
            } footer: {
                Text("Set at least one target. Leave a field blank to skip it. Saving stores these goals to power your daily and weekly progress views.")
            }

            if let errorMessage = model.errorMessage {
                Section {
                    ErrorBanner(message: errorMessage)
                }
            }

            Section {
                Button {
                    Task {
                        focusedField = nil
                        _ = await model.save(api: env.api)
                    }
                } label: {
                    HStack {
                        Spacer()
                        if model.isSaving {
                            ProgressView().tint(Theme.onHyperGreen)
                        } else {
                            Text("Save goals")
                        }
                        Spacer()
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .listRowBackground(Color.clear)
                .disabled(model.isSaving || !model.hasAnyValue)

                if model.goal != nil {
                    Button("Clear goals", role: .destructive) {
                        Task { await model.clear(api: env.api) }
                    }
                    .disabled(model.isSaving)
                }
            }
            .listRowBackground(Color.clear)

            if let summary = model.summary {
                weeklySummarySection(summary)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ceramic)
        .scrollDismissesKeyboard(.interactively)
    }

    private func targetField(_ title: String, text: Binding<String>, suffix: String, field: Field) -> some View {
        HStack {
            Text(title)
            Spacer()
            TextField("—", text: text)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 80)
                .focused($focusedField, equals: field)
            Text(suffix)
                .foregroundStyle(Theme.muted)
        }
    }

    private func weeklySummarySection(_ summary: NutritionSummary) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("This week").rationHeadline()
                    Spacer()
                }
                progressRow(
                    label: "Calories",
                    actual: summary.totals.energyKcal,
                    target: summary.goal?.dailyEnergyKcal,
                    ratio: model.ratios?.energy,
                    unit: "kcal"
                )
                progressRow(
                    label: "Protein",
                    actual: summary.totals.proteinG,
                    target: summary.goal?.proteinG,
                    ratio: model.ratios?.protein,
                    unit: "g"
                )
                progressRow(
                    label: "Carbs",
                    actual: summary.totals.carbsG,
                    target: summary.goal?.carbsG,
                    ratio: model.ratios?.carbs,
                    unit: "g"
                )
                progressRow(
                    label: "Fat",
                    actual: summary.totals.fatG,
                    target: summary.goal?.fatG,
                    ratio: model.ratios?.fat,
                    unit: "g"
                )
            }
            .padding(.vertical, 4)
        } header: {
            Text("Weekly average")
        } footer: {
            Text("Averaged across the last 7 days, including days with no logged meals.")
        }
    }

    @ViewBuilder
    private func progressRow(label: String, actual: Double, target: Double?, ratio: Double?, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).rationBody()
                Spacer()
                if let target {
                    Text("\(Int(actual.rounded())) / \(Int(target.rounded())) \(unit)")
                        .rationCaption()
                } else {
                    Text("\(Int(actual.rounded())) \(unit)")
                        .rationCaption()
                }
            }
            ProgressView(value: NutritionGoalProgress.clamped(ratio))
                .tint(Theme.hyperGreen)
        }
    }
}
