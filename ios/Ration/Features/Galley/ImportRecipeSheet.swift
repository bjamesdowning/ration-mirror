import SwiftUI
import Observation

@MainActor
@Observable
final class ImportRecipeViewModel {
    enum State {
        case idle
        case submitting
        case processing(requestId: String)
        case capturing
        case verification(ExtractedRecipePreview, requestId: String)
        case confirming
        case duplicate(existingMealId: String, existingMealName: String?)
        case completed(MealSummary)
        case failed(String)
        case siteBlocked(message: String)
    }

    private(set) var state: State = .idle
    var url = ""
    var shouldShowPaywall = false
    private var activeTask: Task<Void, Never>?
    private var submissionGeneration = 0
    private var didAttemptDeviceCapture = false

    func cancelActiveWork() {
        submissionGeneration += 1
        activeTask?.cancel()
        activeTask = nil
    }

    func submit(api: RationAPI, session: SessionStore) {
        cancelActiveWork()
        let generation = submissionGeneration
        shouldShowPaywall = false
        didAttemptDeviceCapture = false
        state = .submitting
        activeTask = Task {
            do {
                let response = try await api.importRecipe(ImportRecipeRequest(url: url))
                guard isCurrent(generation) else { return }
                guard let requestId = response.requestId else {
                    state = .failed("Import started but no request id was returned.")
                    return
                }
                Haptics.light()
                state = .processing(requestId: requestId)
                Task { await AIErrorHandling.refreshCredits(session: session, api: api) }
                await poll(requestId: requestId, api: api, generation: generation, session: session)
            } catch is CancellationError {
                return
            } catch let error as APIError where error.statusCode == 409 && error.code == "DUPLICATE_URL" {
                guard isCurrent(generation) else { return }
                if let existingId = error.existingMealId {
                    state = .duplicate(
                        existingMealId: existingId,
                        existingMealName: error.existingMealName
                    )
                } else {
                    state = .failed(error.errorDescription ?? "This recipe URL was already imported.")
                }
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

    func poll(
        requestId: String,
        api: RationAPI,
        generation: Int,
        session: SessionStore
    ) async {
        let maxAttempts = 80
        let delayNanoseconds: UInt64 = 1_500_000_000
        for attempt in 0..<maxAttempts {
            do {
                try Task.checkCancellation()
                if attempt > 0 {
                    try await Task.sleep(nanoseconds: delayNanoseconds)
                }
                let result = try await api.importRecipeStatus(requestId: requestId)
                guard isCurrent(generation) else { return }
                if result.code == "DUPLICATE_URL", let existingId = result.existingMealId {
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
                    if shouldAttemptDeviceCapture(result) {
                        await captureAndRetry(api: api, generation: generation, session: session)
                        return
                    }
                    if isSiteBlocked(result) {
                        state = .siteBlocked(
                            message: result.error
                                ?? "This site blocked automated import. Try loading from your device again, or add the meal manually."
                        )
                        return
                    }
                    state = .failed(result.error ?? "Import failed.")
                    return
                default:
                    state = .processing(requestId: requestId)
                }
            } catch is CancellationError {
                return
            } catch {
                guard isCurrent(generation) else { return }
                if let apiError = error as? APIError,
                   [429, 503].contains(apiError.statusCode ?? 0),
                   attempt < maxAttempts - 1
                {
                    continue
                }
                state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                return
            }
        }
        guard isCurrent(generation) else { return }
        state = .failed("Import is still processing. Check Galley shortly.")
    }

    private func shouldAttemptDeviceCapture(_ result: ImportRecipeStatusResponse) -> Bool {
        !didAttemptDeviceCapture && isSiteBlocked(result)
    }

    private func isSiteBlocked(_ result: ImportRecipeStatusResponse) -> Bool {
        if result.code == "SITE_BLOCKED" { return true }
        let message = (result.error ?? "").lowercased()
        return message.contains("blocked automated import")
            || message.contains("access issue")
            || message.contains("paste the page html")
    }

    private func captureAndRetry(
        api: RationAPI,
        generation: Int,
        session: SessionStore
    ) async {
        didAttemptDeviceCapture = true
        state = .capturing
        do {
            let html = try await RecipePageCapture.captureHtml(from: url)
            guard isCurrent(generation) else { return }
            // Assisted retry is a new 1-credit job (blocked attempt was refunded).
            state = .submitting
            let response = try await api.importRecipe(
                ImportRecipeRequest(url: url, pageHtml: html)
            )
            guard isCurrent(generation) else { return }
            guard let requestId = response.requestId else {
                state = .failed("Import started but no request id was returned.")
                return
            }
            Haptics.light()
            state = .processing(requestId: requestId)
            Task { await AIErrorHandling.refreshCredits(session: session, api: api) }
            await poll(requestId: requestId, api: api, generation: generation, session: session)
        } catch is CancellationError {
            return
        } catch let error as RecipePageCaptureError {
            guard isCurrent(generation) else { return }
            state = .siteBlocked(message: error.localizedDescription)
        } catch {
            guard isCurrent(generation) else { return }
            if AIErrorHandling.mapSubmitError(error) == .paywall {
                shouldShowPaywall = true
                state = .idle
            } else {
                state = .siteBlocked(
                    message: (error as? APIError)?.errorDescription
                        ?? error.localizedDescription
                )
            }
        }
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

    func reset() {
        cancelActiveWork()
        state = .idle
        shouldShowPaywall = false
        didAttemptDeviceCapture = false
    }

    private func isCurrent(_ generation: Int) -> Bool {
        !Task.isCancelled && generation == submissionGeneration
    }
}

struct ImportRecipeSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = ImportRecipeViewModel()
    @State private var consent = AIConsentCoordinator()
    @State private var showingPaywall = false
    var onComplete: () async -> Void = {}
    var onImportedMeal: (MealSummary) -> Void = { _ in }
    var onAddManually: () -> Void = {}

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
                case .capturing:
                    capturingContent
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
                        Button("Add meal manually") {
                            dismiss()
                            onAddManually()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                case let .siteBlocked(message):
                    siteBlockedContent(message)
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
                    title: "Import recipe",
                    detail: "Paste a recipe URL and Ration extracts ingredients and directions into Galley. HTTPS only. Tested with allrecipes.com and most major recipe sites. Some sites block automated imports — if so, Ration will try loading the page on your device; if that fails too, add the meal manually.",
                    creditCost: creditCost,
                    costLabel: "per import",
                    nextSteps: "Review the imported meal before adding to Galley."
                )
                TextField("Recipe URL", text: $model.url)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .textFieldStyle(.roundedBorder)
                Text("If a site blocks bots, you'll see a clear next step — device reload or manual entry.")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                AIFeaturePrimaryButton(
                    label: "Import",
                    creditCost: creditCost,
                    isDisabled: model.url.trimmingCharacters(in: .whitespaces).isEmpty
                ) {
                    consent.presentIfNeeded(session: env.session) {
                        model.submit(api: env.api, session: env.session)
                    }
                }
            }
        }
    }

    private var capturingContent: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(Theme.hyperGreen)
            Text("Loading page on your device…")
                .rationHeadline()
            Text("This site blocked our servers. Trying again with your connection (uses 1 credit if extraction starts).")
                .rationCaption()
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    private func siteBlockedContent(_ message: String) -> some View {
        VStack(spacing: 12) {
            ErrorBanner(message: message)
            Text("Why this happened")
                .rationHeadline()
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("Publishers like allrecipes.com often block automated downloads. Your phone can sometimes open the page when our servers cannot. If that still fails, open the recipe in Safari and add it manually.")
                .rationCaption()
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let safariURL = URL(string: model.url), safariURL.scheme == "https" {
                Link(destination: safariURL) {
                    Label("Open in Safari", systemImage: "safari")
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            Button("Try again") { model.reset() }
                .buttonStyle(SecondaryButtonStyle())
            Button("Add meal manually") {
                dismiss()
                onAddManually()
            }
            .buttonStyle(PrimaryButtonStyle())
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
                        .font(Typography.heroIcon(36))
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
