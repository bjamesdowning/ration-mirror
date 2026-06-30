import SwiftUI
import Observation

@MainActor
@Observable
final class ImportRecipeViewModel {
    enum State {
        case idle
        case submitting
        case processing(requestId: String)
        case completed(MealSummary)
        case failed(String)
    }

    private(set) var state: State = .idle
    var url = ""
    private let maxPollAttempts = 80
    private let pollDelayNanoseconds: UInt64 = 1_500_000_000

    func submit(api: RationAPI) async {
        state = .submitting
        do {
            let response = try await api.importRecipe(ImportRecipeRequest(url: url))
            guard let requestId = response.requestId else {
                state = .failed("Import started but no request id was returned.")
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
                let result = try await api.importRecipeStatus(requestId: requestId)
                switch result.status {
                case "completed":
                    if let meal = result.meal {
                        state = .completed(meal)
                    } else {
                        state = .failed(result.error ?? "Import completed without a meal.")
                    }
                    return
                case "failed":
                    state = .failed(result.error ?? "Import failed.")
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
        state = .failed("Import is still processing. Check Galley shortly.")
    }

    func reset() { state = .idle }
}

struct ImportRecipeSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = ImportRecipeViewModel()
    @State private var showingIntro = false
    var onComplete: () async -> Void = {}

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                switch model.state {
                case .idle:
                    idleContent
                case .submitting, .processing:
                    AIProcessingView(
                        feature: .importRecipe,
                        creditCost: env.session.session?.aiCosts?.importUrl ?? 1
                    )
                case let .completed(meal):
                    completedContent(meal)
                case let .failed(message):
                    VStack(spacing: 12) {
                        ErrorBanner(message: message)
                        Button("Try again") { model.reset() }.buttonStyle(SecondaryButtonStyle())
                    }
                }
            }
            .padding(16)
            .navigationTitle("Import recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .background(Theme.ceramic)
            .sheet(isPresented: $showingIntro) {
                AIFeatureIntroView(
                    title: "Import recipe",
                    detail: "Paste a recipe URL and Ration extracts ingredients and directions into Galley.",
                    creditCost: env.session.session?.aiCosts?.importUrl ?? 1,
                    costLabel: "per import",
                    confirmLabel: "Import",
                    nextSteps: "Review the imported meal before saving to Galley.",
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
            TextField("Recipe URL", text: $model.url)
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
                .textFieldStyle(.roundedBorder)
            Button("Import") { showingIntro = true }
                .buttonStyle(AIButtonStyle())
                .disabled(model.url.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }

    private func completedContent(_ meal: MealSummary) -> some View {
        VStack(spacing: 16) {
            GlassCard {
                VStack(spacing: 8) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(Theme.hyperGreen)
                    Text("Imported").rationHeadline()
                    Text(meal.name.capitalized).rationCaption()
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
