import SwiftUI
import Observation

@MainActor
@Observable
final class ImportRecipeViewModel {
    enum State {
        case idle
        case submitting
        case processing(requestId: String)
        case verification(ExtractedRecipePreview, requestId: String)
        case confirming
        case duplicate(existingMealId: String, existingMealName: String?)
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
        } catch let error as APIError where error.statusCode == 409 && error.code == "DUPLICATE_URL" {
            if let existingId = error.existingMealId {
                state = .duplicate(
                    existingMealId: existingId,
                    existingMealName: error.existingMealName
                )
            } else {
                state = .failed(error.errorDescription ?? "This recipe URL was already imported.")
            }
        } catch {
            state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func poll(requestId: String, api: RationAPI) async {
        for attempt in 0..<maxPollAttempts {
            do {
                try await Task.sleep(nanoseconds: pollDelayNanoseconds)
                let result = try await api.importRecipeStatus(requestId: requestId)
                if result.code == "DUPLICATE_URL",
                   let existingId = result.existingMealId
                {
                    state = .duplicate(
                        existingMealId: existingId,
                        existingMealName: result.existingMealName
                    )
                    return
                }
                switch result.status {
                case "completed":
                    if let meal = result.meal {
                        state = .completed(meal)
                    } else if let extracted = result.extractedRecipe {
                        state = .verification(extracted, requestId: requestId)
                    } else {
                        state = .failed(result.error ?? "Import completed without recipe data.")
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

    func confirm(requestId: String, api: RationAPI) async {
        state = .confirming
        do {
            let response = try await api.importRecipeConfirm(requestId: requestId)
            state = .completed(response.meal)
        } catch {
            state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func reset() { state = .idle }
}

struct ImportRecipeSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = ImportRecipeViewModel()
    @State private var consent = AIConsentCoordinator()
    var onComplete: () async -> Void = {}
    var onImportedMeal: (MealSummary) -> Void = { _ in }

    private var creditCost: Int {
        env.session.session?.aiCosts?.importUrl ?? 1
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                switch model.state {
                case .idle:
                    idleContent
                case .submitting, .processing:
                    AIProcessingView(feature: .importRecipe, creditCost: creditCost)
                case let .verification(extracted, requestId):
                    verificationContent(extracted, requestId: requestId)
                case .confirming:
                    ProgressView("Adding to Galley…")
                        .tint(Theme.hyperGreen)
                case let .duplicate(existingId, existingName):
                    duplicateContent(existingId: existingId, existingName: existingName)
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
        }
    }

    private var idleContent: some View {
        ScrollView {
            VStack(spacing: 16) {
                AIFeatureInlineIntro(
                    title: "Import recipe",
                    detail: "Paste a recipe URL and Ration extracts ingredients and directions into Galley.",
                    creditCost: creditCost,
                    costLabel: "per import",
                    nextSteps: "Review the imported meal before adding to Galley."
                )
                TextField("Recipe URL", text: $model.url)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .textFieldStyle(.roundedBorder)
                AIFeaturePrimaryButton(
                    label: "Import",
                    creditCost: creditCost,
                    isDisabled: model.url.trimmingCharacters(in: .whitespaces).isEmpty
                ) {
                    consent.presentIfNeeded(session: env.session) {
                        Task { await model.submit(api: env.api) }
                    }
                }
            }
        }
    }

    private func verificationContent(_ extracted: ExtractedRecipePreview, requestId: String) -> some View {
        VStack(spacing: 16) {
            GlassCard {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Review import").rationHeadline()
                    Text(extracted.name.capitalized).rationBody()
                    Text("\(extracted.ingredientCount) ingredients")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button("Add to Galley") {
                Task { await model.confirm(requestId: requestId, api: env.api) }
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }

    private func duplicateContent(existingId: String, existingName: String?) -> some View {
        VStack(spacing: 16) {
            GlassCard {
                VStack(spacing: 8) {
                    Text("Already imported").rationHeadline()
                    if let existingName {
                        Text(existingName.capitalized).rationCaption()
                    }
                }
            }
            Button("View existing meal") {
                onImportedMeal(MealSummary(id: existingId, name: existingName ?? "meal"))
                dismiss()
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }

    private func completedContent(_ meal: MealSummary) -> some View {
        VStack(spacing: 16) {
            GlassCard {
                VStack(spacing: 8) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(Theme.hyperGreen)
                    Text("Added to Galley").rationHeadline()
                    Text(meal.name.capitalized).rationCaption()
                }
            }
            Button("View meal") {
                Task {
                    await onComplete()
                    onImportedMeal(meal)
                    dismiss()
                }
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }
}
