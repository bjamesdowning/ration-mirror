import SwiftUI

struct PlanWeekSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = PlanWeekViewModel()
    var onComplete: () async -> Void = {}

    private var creditCost: Int {
        env.session.session?.aiCosts?.mealPlanWeekly ?? 3
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                switch model.state {
                case .idle:
                    idleContent
                case .submitting, .processing:
                    AIProcessingView(feature: .planWeek, creditCost: creditCost)
                case let .completed(entries):
                    completedContent(entries)
                case let .failed(message):
                    VStack(spacing: 12) {
                        ErrorBanner(message: message)
                        Button("Try again") { model.reset() }.buttonStyle(SecondaryButtonStyle())
                    }
                }
            }
            .padding(16)
            .navigationTitle("Plan week")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .background(Theme.ceramic)
        }
    }

    private var idleContent: some View {
        ScrollView {
            VStack(spacing: 16) {
                AIFeatureInlineIntro(
                    title: "Plan your week",
                    detail: "AI schedules meals from your Galley across breakfast, lunch, and dinner slots.",
                    creditCost: creditCost,
                    costLabel: "per plan",
                    nextSteps: "Review the generated schedule, then confirm to add entries to Manifest."
                )
                TextField("Start date (YYYY-MM-DD)", text: $model.startDate)
                    .textFieldStyle(.roundedBorder)
                Stepper("Days: \(model.days)", value: $model.days, in: 1...7)
                TextField("Dietary note (optional)", text: $model.dietaryNote, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                AIFeaturePrimaryButton(label: "Plan week", creditCost: creditCost) {
                    Task { await model.submit(api: env.api) }
                }
            }
        }
    }

    private func completedContent(_ entries: [PlanWeekScheduleEntry]) -> some View {
        ScrollView {
            VStack(spacing: 12) {
                ForEach(entries) { entry in
                    GlassCard {
                        HStack {
                            Text(entry.date).rationCaption()
                            Text(entry.mealName.capitalized).rationBody()
                            Spacer()
                            Text(entry.slotType.capitalized).rationCaption()
                        }
                    }
                }
                Button("Apply to Manifest") {
                    Task {
                        do {
                            try await model.applySchedule(entries, api: env.api)
                            await onComplete()
                            dismiss()
                        } catch {
                            model.reset()
                        }
                    }
                }
                .buttonStyle(AIButtonStyle())
            }
        }
    }
}
