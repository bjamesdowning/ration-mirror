import SwiftUI

/// How a Fuel summary mark reads. A closed calorie ring is the ceiling.
/// A met macro bar is a target reached. They are not the same state.
enum FuelSummaryTone: Equatable {
    case inProgress
    case closedCeiling
    case metTarget
    case over

    var ringColor: Color {
        switch self {
        case .inProgress, .metTarget:
            Theme.hyperGreen
        case .closedCeiling:
            Theme.carbon
        case .over:
            Theme.warning
        }
    }

    var barColor: Color {
        switch self {
        case .inProgress, .metTarget:
            Theme.hyperGreen
        case .over:
            Theme.warning
        case .closedCeiling:
            Theme.carbon
        }
    }
}

/// Remaining calorie ring over protein, carb, and fat cards.
struct FuelDaySummaryModel: Equatable {
    static let unsetCopy = "No goals yet. Set targets."
    static let goalEditor = "NutritionGoalsView"

    struct CalorieRing: Equatable {
        var remaining: Int
        var consumed: Int
        var goal: Int
        var progress: Double
        var tone: FuelSummaryTone
        var goalLine: String
    }

    struct MacroCard: Equatable {
        var name: String
        var fraction: String
        var progress: Double
        var tone: FuelSummaryTone
    }

    var unset: Bool
    var calorie: CalorieRing?
    var macros: [MacroCard]
    var accessibilityLabel: String
    var opensNutritionGoals: Bool { true }

    static func make(
        energyKcal: Double,
        proteinG: Double,
        carbsG: Double,
        fatG: Double,
        fiberG: Double? = nil,
        goal: NutritionSummary.Goal?
    ) -> FuelDaySummaryModel {
        let day = NutritionDayTotals(
            date: goal?.effectiveFrom ?? "",
            energyKcal: energyKcal,
            proteinG: proteinG,
            carbsG: carbsG,
            fatG: fatG,
            fiberG: fiberG,
            coverageAvg: 0,
            entryCount: 0
        )
        let lines = NutritionGoalProgress.manifestStripLines(day: day, goal: goal)
            .filter { $0.key != "fiber" }
        let calorie = lines.first { $0.key == "energy" }.map(calorieRing)
        let macros = lines.filter { $0.key != "energy" }.map(macroCard)
        if calorie == nil && macros.isEmpty {
            return FuelDaySummaryModel(
                unset: true,
                calorie: nil,
                macros: [],
                accessibilityLabel: unsetCopy
            )
        }
        var spoken = [String]()
        if let calorie {
            spoken.append(
                "Remaining \(calorie.remaining) kilocalories, \(calorie.consumed) consumed, \(calorie.goalLine)"
            )
        }
        spoken.append(contentsOf: macros.map { "\($0.name) \($0.fraction)" })
        return FuelDaySummaryModel(
            unset: false,
            calorie: calorie,
            macros: macros,
            accessibilityLabel: spoken.joined(separator: ", ")
        )
    }

    private static func calorieRing(_ line: NutritionGoalProgress.ManifestStripLine) -> CalorieRing {
        let goal = Int(line.target.rounded())
        let consumed = Int(line.actual.rounded())
        let remaining = max(goal - consumed, 0)
        return CalorieRing(
            remaining: remaining,
            consumed: consumed,
            goal: goal,
            progress: min(max(line.ratio, 0), 1),
            tone: line.isOverTarget ? .over : (remaining == 0 ? .closedCeiling : .inProgress),
            goalLine: "Goal \(goal) kcal"
        )
    }

    private static func macroCard(_ line: NutritionGoalProgress.ManifestStripLine) -> MacroCard {
        let actual = Int(line.actual.rounded())
        let target = Int(line.target.rounded())
        let tone: FuelSummaryTone = if line.isOverTarget {
            .over
        } else if actual >= target {
            .metTarget
        } else {
            .inProgress
        }
        return MacroCard(
            name: fullName(line.key),
            fraction: "\(actual) / \(target)g",
            progress: min(max(line.ratio, 0), 1),
            tone: tone
        )
    }

    private static func fullName(_ key: String) -> String {
        switch key {
        case "protein": "Protein"
        case "carbs": "Carbs"
        case "fat": "Fat"
        default: key
        }
    }
}

struct FuelDaySummary: View {
    let model: FuelDaySummaryModel
    var onOpenGoals: () -> Void

    var body: some View {
        Button(action: onOpenGoals) {
            VStack(alignment: .leading, spacing: 16) {
                if model.unset {
                    Text(FuelDaySummaryModel.unsetCopy)
                        .font(Typography.headline())
                        .foregroundStyle(Theme.carbon)
                        .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
                } else {
                    if let calorie = model.calorie {
                        calorieBlock(calorie)
                    }
                    if !model.macros.isEmpty {
                        HStack(alignment: .top, spacing: 8) {
                            ForEach(model.macros, id: \.name) { card in
                                macroCard(card)
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.accessibilityLabel)
        .accessibilityHint("Opens Nutrition Goals")
    }

    private func calorieBlock(_ calorie: FuelDaySummaryModel.CalorieRing) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 16) {
                ring(calorie)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(calorie.consumed)")
                        .font(Typography.title())
                        .foregroundStyle(Theme.carbon)
                    Text("consumed")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
            }
            Text(calorie.goalLine)
                .font(Typography.caption())
                .foregroundStyle(Theme.carbon)
        }
    }

    private func ring(_ calorie: FuelDaySummaryModel.CalorieRing) -> some View {
        ZStack {
            Circle()
                .stroke(Theme.platinum, lineWidth: 10)
            Circle()
                .trim(from: 0, to: calorie.progress)
                .stroke(calorie.tone.ringColor, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(calorie.remaining)")
                    .font(Typography.display())
                    .foregroundStyle(Theme.carbon)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                Text("remaining")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 12)
        }
        .frame(width: 148, height: 148)
        .accessibilityHidden(true)
    }

    private func macroCard(_ card: FuelDaySummaryModel.MacroCard) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(card.name)
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
            Text(card.fraction)
                .font(Typography.body())
                .foregroundStyle(Theme.carbon)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            summaryBar(progress: card.progress, tone: card.tone)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHidden(true)
    }

    private func summaryBar(progress: Double, tone: FuelSummaryTone) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.platinum)
                Capsule()
                    .fill(tone.barColor)
                    .frame(width: max(0, geo.size.width * min(max(progress, 0), 1)))
            }
        }
        .frame(height: 4)
    }

}

enum FuelPageContent {
    /// Fuel does not show Timeline / Slots. Settings still writes `diaryLayout`.
    static let includesDayLayoutPicker = false
    static let rowSwipeActions = ["Edit", "Delete"]
    static let showsStandingVoid = false
}
