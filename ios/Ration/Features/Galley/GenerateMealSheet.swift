import SwiftUI
import Observation

struct GenerateMealSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = GenerateMealViewModel()
    @State private var selectedRecipeNames: Set<String> = []
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var consent = AIConsentCoordinator()
    @State private var paywallContext: PaywallContext?
    var onComplete: (Int) async -> Void = { _ in }

    private var creditCost: Int {
        env.session.session?.aiCosts?.mealGenerate ?? 2
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                switch model.state {
                case .idle:
                    idleContent
                case .submitting, .processing:
                    AIProcessingView(feature: .generateMeals, creditCost: creditCost)
                case let .completed(recipes):
                    completedContent(recipes)
                case let .failed(message):
                    VStack(spacing: 12) {
                        ErrorBanner(message: message)
                        Button("Try again") {
                            model.reset()
                            selectedRecipeNames = []
                        }.buttonStyle(SecondaryButtonStyle())
                    }
                }
            }
            .padding(16)
            .navigationTitle("Generate meal")
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
            .sheet(item: $paywallContext, onDismiss: {
                model.shouldShowPaywall = false
            }) { ctx in
                PaywallView(context: ctx)
            }
            .onChange(of: model.shouldShowPaywall) { _, show in
                if show {
                    paywallContext = .credits()
                    model.shouldShowPaywall = false
                }
            }
            .onDisappear { model.cancelActiveWork() }
        }
    }

    private var idleContent: some View {
        ScrollView {
            VStack(spacing: 16) {
                AIFeatureInlineIntro(
                    title: "Generate meals",
                    detail: "Each generation returns 3 meal ideas from your Cargo—recipes you can make with what you have.",
                    creditCost: creditCost,
                    costLabel: "per generation",
                    nextSteps: "Review all 3, pick the ones you like, then save them to Galley."
                )
                TextField("Optional customization (e.g. vegetarian)", text: $model.customization, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                AIFeaturePrimaryButton(label: "Generate ideas", creditCost: creditCost) {
                    consent.presentIfNeeded(session: env.session) {
                        model.submit(api: env.api, session: env.session)
                    }
                }
            }
        }
    }

    private func completedContent(_ recipes: [GeneratedRecipe]) -> some View {
        ScrollView {
            VStack(spacing: 12) {
                if let saveError {
                    ErrorBanner(message: saveError)
                }
                ForEach(recipes) { recipe in
                    Button {
                        toggleRecipe(recipe)
                    } label: {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Image(systemName: selectedRecipeNames.contains(recipe.name) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(selectedRecipeNames.contains(recipe.name) ? Theme.hyperGreen : Theme.muted)
                                    Text(recipe.name.capitalized).rationHeadline()
                                    Spacer()
                                }
                                if let description = recipe.description {
                                    Text(description).rationCaption()
                                }
                                if let ingredients = recipe.ingredients, !ingredients.isEmpty {
                                    Text("\(ingredients.count) ingredients").rationCaption()
                                }
                                if let directions = recipe.directions, !DirectionsParser.parseDirections(directions).isEmpty {
                                    Text("\(DirectionsParser.parseDirections(directions).count) steps").rationCaption()
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .buttonStyle(.plain)
                }
                Button(primaryActionTitle) {
                    Task { await finish(recipes: recipes) }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isSaving || selectedRecipeNames.isEmpty)
            }
            .onAppear {
                selectedRecipeNames = Set(recipes.map(\.name))
            }
        }
    }

    private var primaryActionTitle: String {
        let count = selectedRecipeNames.count
        if count == 0 { return "Add to Galley" }
        return "Add \(count) to Galley"
    }

    private func toggleRecipe(_ recipe: GeneratedRecipe) {
        if selectedRecipeNames.contains(recipe.name) {
            selectedRecipeNames.remove(recipe.name)
        } else {
            selectedRecipeNames.insert(recipe.name)
        }
    }

    @MainActor
    private func finish(recipes: [GeneratedRecipe]) async {
        let selected = recipes.filter { selectedRecipeNames.contains($0.name) }
        guard !selected.isEmpty else { return }
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            try await model.saveSelected(selected, api: env.api)
            Haptics.success()
            await onComplete(selected.count)
            dismiss()
        } catch let error as APIError {
            if let ctx = CapacityUpgrade.context(
                from: error,
                isCrewMember: env.session.isCrewMember
            ) {
                paywallContext = ctx
            } else {
                saveError = error.errorDescription
            }
        } catch {
            saveError = error.localizedDescription
        }
    }
}
