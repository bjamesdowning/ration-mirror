import SwiftUI

struct PlanWeekSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = PlanWeekViewModel()
    @State private var consent = AIConsentCoordinator()
    @State private var showingPaywall = false
    var onComplete: (Int) async -> Void = { _ in }

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
                case .completed:
                    completedContent
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
            .sheet(isPresented: Binding(
                get: { consent.isPresenting },
                set: { if !$0 { consent.decline() } }
            )) {
                AIConsentGateView(
                    onAccept: { Task { await consent.accept(api: env.api, session: env.session) } },
                    onDecline: { consent.decline() }
                )
                .presentationDetents([.large])
            }
            .sheet(isPresented: $showingPaywall) { PaywallView() }
            .onChange(of: model.shouldShowPaywall) { _, show in
                if show { showingPaywall = true }
            }
            .onDisappear { model.cancelActiveWork() }
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
                TextField("Dietary note (optional)", text: $model.dietaryNote, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                PlanWeekRangeCalendar(
                    rangeStart: $model.rangeStart,
                    rangeEnd: $model.rangeEnd
                )
                Link("Terms of Service", destination: AppConfig.termsURL)
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
                AIFeaturePrimaryButton(label: "Plan week", creditCost: creditCost) {
                    consent.presentIfNeeded(session: env.session) {
                        model.submit(api: env.api, session: env.session)
                    }
                }
                .disabled(!model.canSubmitPlan)
            }
        }
    }

    private var completedContent: some View {
        List {
            ForEach(model.scheduleEntries) { entry in
                GlassCard {
                    HStack {
                        Text(entry.date).rationCaption()
                        Text(entry.mealName.capitalized).rationBody()
                        Spacer()
                        Text(entry.slotType.capitalized).rationCaption()
                    }
                }
                .listRowBackground(Theme.surface)
                .destructiveTrailingSwipe {
                    model.removeScheduleEntry(entry)
                }
            }
            Section {
                Button(applyButtonTitle) {
                    Task {
                        do {
                            let count = try await model.applySchedule(api: env.api)
                            await onComplete(count)
                            dismiss()
                        } catch {
                            model.fail(
                                (error as? APIError)?.errorDescription ?? error.localizedDescription
                            )
                        }
                    }
                }
                .buttonStyle(AIButtonStyle())
                .disabled(model.scheduleEntries.isEmpty)
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    private var applyButtonTitle: String {
        let count = model.scheduleEntries.count
        if count == 0 { return "Apply to Manifest" }
        return "Apply \(count) meals to Manifest"
    }
}
