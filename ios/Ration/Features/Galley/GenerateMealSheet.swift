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
    private let maxPollAttempts = 80
    private let pollDelayNanoseconds: UInt64 = 1_500_000_000

    func submit(api: RationAPI) async {
        state = .submitting
        do {
            let response = try await api.generateMeal(GenerateMealRequest(customization: customization.isEmpty ? nil : customization))
            guard let requestId = response.requestId else {
                state = .failed("Generation started but no request id was returned.")
                return
            }
            Haptics.light()
            state = .processing(requestId: requestId)
            await poll(requestId: requestId, api: api)
        } catch {
            state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func poll(requestId: String, api: RationAPI) async {
        for attempt in 0..<maxPollAttempts {
            do {
                try await Task.sleep(nanoseconds: pollDelayNanoseconds)
                let result = try await api.generateMealStatus(requestId: requestId)
                switch result.status {
                case "completed":
                    state = .completed(result.recipes ?? [])
                    return
                case "failed":
                    state = .failed(result.error ?? "Generation failed.")
                    return
                default:
                    state = .processing(requestId: requestId)
                }
            } catch is CancellationError {
                return
            } catch {
                if let apiError = error as? APIError,
                   [429, 503].contains(apiError.statusCode ?? 0),
                   attempt < maxPollAttempts - 1
                {
                    continue
                }
                state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                return
            }
        }
        state = .failed("Generation is still processing. Check Galley shortly.")
    }

    func reset() { state = .idle }
}

struct GenerateMealSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = GenerateMealViewModel()
    @State private var showingIntro = false
    var onComplete: () async -> Void = {}

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                switch model.state {
                case .idle:
                    idleContent
                case .submitting, .processing:
                    LoadingView(label: "Generating meals…")
                case let .completed(recipes):
                    completedContent(recipes)
                case let .failed(message):
                    VStack(spacing: 12) {
                        ErrorBanner(message: message)
                        Button("Try again") { model.reset() }.buttonStyle(SecondaryButtonStyle())
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
            .sheet(isPresented: $showingIntro) {
                AIFeatureIntroView(
                    title: "Generate meals",
                    detail: "AI creates recipe ideas from your Cargo.",
                    creditCost: env.session.session?.aiCosts?.mealGenerate ?? 2,
                    onContinue: {
                        showingIntro = false
                        Task { await model.submit(api: env.api) }
                    }
                )
                .presentationDetents([.medium])
            }
        }
    }

    private var idleContent: some View {
        VStack(spacing: 16) {
            TextField("Optional customization (e.g. vegetarian)", text: $model.customization, axis: .vertical)
                .textFieldStyle(.roundedBorder)
            Button("Generate") { showingIntro = true }
                .buttonStyle(PrimaryButtonStyle())
        }
    }

    private func completedContent(_ recipes: [GeneratedRecipe]) -> some View {
        ScrollView {
            VStack(spacing: 12) {
                ForEach(recipes) { recipe in
                    GlassCard {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(recipe.name.capitalized).rationHeadline()
                            if let description = recipe.description {
                                Text(description).rationCaption()
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                Button("Done") {
                    Task {
                        await onComplete()
                        dismiss()
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
            }
        }
    }
}
