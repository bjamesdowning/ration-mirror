import SwiftUI
import Observation

@MainActor
@Observable
final class GenerateMealViewModel {
    enum State {
        case idle
        case submitting
        case processing(requestId: String)
        case completed([GeneratedRecipe])
        case failed(String)
    }

    private(set) var state: State = .idle
    var customization = ""
    var shouldShowPaywall = false
    private var activeTask: Task<Void, Never>?
    private var submissionGeneration = 0

    func cancelActiveWork() {
        submissionGeneration += 1
        activeTask?.cancel()
        activeTask = nil
    }

    func submit(api: RationAPI, session: SessionStore) {
        cancelActiveWork()
        let generation = submissionGeneration
        shouldShowPaywall = false
        state = .submitting
        activeTask = Task {
            do {
                let response = try await api.generateMeal(
                    GenerateMealRequest(customization: customization.isEmpty ? nil : customization)
                )
                guard isCurrent(generation) else { return }
                guard let requestId = response.requestId else {
                    state = .failed("Generation started but no request id was returned.")
                    return
                }
                Haptics.light()
                state = .processing(requestId: requestId)
                Task { await AIErrorHandling.refreshCredits(session: session, api: api) }
                await poll(requestId: requestId, api: api, generation: generation)
            } catch is CancellationError {
                return
            } catch {
                guard isCurrent(generation) else { return }
                if AIErrorHandling.mapSubmitError(error) == .paywall {
                    shouldShowPaywall = true
                    state = .idle
                } else {
                    state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                }
            }
        }
    }

    func saveSelected(_ recipes: [GeneratedRecipe], api: RationAPI) async throws {
        for recipe in recipes {
            let steps = DirectionsParser.parseDirections(recipe.directions)
            let directionsPayload = steps.isEmpty ? recipe.directions : DirectionsParser.serializeDirections(steps)
            let body = CreateMealRequest(
                name: recipe.name.lowercased(),
                description: recipe.description,
                directions: directionsPayload,
                servings: recipe.servings ?? 2,
                prepTime: recipe.prepTime,
                cookTime: recipe.cookTime,
                ingredients: recipe.ingredients ?? [],
                tags: recipe.tags ?? []
            )
            _ = try await api.createMeal(body)
        }
    }

    func poll(requestId: String, api: RationAPI, generation: Int) async {
        let poller = AIJobPoller<GenerateMealStatusResponse>(
            fetchStatus: { try await api.generateMealStatus(requestId: $0) },
            interpretStatus: { result in
                switch result.status {
                case "completed": .completed
                case "failed": .failed(result.error ?? "Generation failed.")
                default: .running
                }
            }
        )
        do {
            let result = try await poller.poll(requestId: requestId)
            guard isCurrent(generation) else { return }
            state = .completed(result.recipes ?? [])
        } catch is CancellationError {
            return
        } catch AIJobPollError.timedOut {
            guard isCurrent(generation) else { return }
            state = .failed("Generation is still processing. Check Galley shortly.")
        } catch let AIJobPollError.failed(message) {
            guard isCurrent(generation) else { return }
            state = .failed(message)
        } catch {
            guard isCurrent(generation) else { return }
            state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func reset() {
        cancelActiveWork()
        state = .idle
        shouldShowPaywall = false
    }

    private func isCurrent(_ generation: Int) -> Bool {
        !Task.isCancelled && generation == submissionGeneration
    }
}

struct GenerateMealSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = GenerateMealViewModel()
    @State private var selectedRecipeNames: Set<String> = []
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var consent = AIConsentCoordinator()
    @State private var showingPaywall = false
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
                    title: "Generate meals",
                    detail: "AI creates recipe ideas from your Cargo inventory.",
                    creditCost: creditCost,
                    costLabel: "per generation",
                    nextSteps: "Pick recipes you like, then save them to Galley."
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
        } catch {
            saveError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
