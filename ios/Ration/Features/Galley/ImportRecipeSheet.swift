import PhotosUI
import SwiftUI
import Observation

struct ImportRecipeSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = ImportRecipeViewModel()
    @State private var consent = AIConsentCoordinator()
    @State private var paywallContext: PaywallContext?
    @State private var photoPickerItem: PhotosPickerItem?
    @State private var showingInfo = false
    @State private var didAutoStart = false
    var initialURL: String? = nil
    /// Optional share-sheet caption text forwarded as `userText`.
    var initialUserText: String? = nil
    /// When true (Share Extension handoff), start import after credit/consent gates.
    var autoStart: Bool = false
    var onComplete: () async -> Void = {}
    var onImportedMeal: (MealSummary) -> Void = { _ in }
    var onAddManually: () -> Void = {}

    private var clientFlags: ClientFlags { env.session.clientFlags }

    private var creditCost: Int {
        env.session.session?.aiCosts?.importUrl ?? 3
    }

    private var photoImportEnabled: Bool {
        clientFlags.isAiImportPhotoEnabled
    }

    private var linkImportEnabled: Bool {
        clientFlags.isAiImportWebEnabled || clientFlags.isAiImportSocialEnabled
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                switch model.state {
                case .idle:
                    idleContent
                case .submitting, .processing:
                    AIProcessingView(
                        feature: .importRecipe,
                        creditCost: creditCost,
                        titleOverride: processingTitle,
                        messageOverride: processingMessage
                    )
                case .capturing:
                    capturingContent
                case let .verification(extracted, requestId, softFailToPhoto):
                    verificationContent(
                        extracted,
                        requestId: requestId,
                        softFailToPhoto: softFailToPhoto
                    )
                case .confirming:
                    AIProcessingView(
                        feature: .importRecipe,
                        creditCost: nil,
                        titleOverride: "Adding to Galley…",
                        messageOverride: "Saving the imported recipe to your Galley."
                    )
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
                case let .softFailToPhoto(message):
                    softFailToPhotoContent(message)
                case let .siteBlocked(message):
                    siteBlockedContent(message)
                }
            }
            .padding(16)
            .navigationTitle("Import recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingInfo = true
                    } label: {
                        Image(systemName: "info.circle")
                    }
                    .accessibilityLabel("About recipe import")
                }
            }
            .sheet(isPresented: $showingInfo) {
                NavigationStack {
                    ScrollView {
                        AIFeatureInlineIntro(
                            title: "Import recipe",
                            detail: importIntroDetail,
                            creditCost: creditCost,
                            costLabel: "per import",
                            nextSteps: "Review the imported meal before adding to Galley.",
                            hint: clientFlags.isNutritionEngineEnabled
                                ? "Nutrition (when available): USDA match first; AI estimates are labelled—edit before saving."
                                : nil
                        )
                        .padding(16)
                    }
                    .navigationTitle("About import")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { showingInfo = false }
                        }
                    }
                }
                .presentationDetents([.medium, .large])
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
                model.paywallContext = nil
            }) { ctx in
                PaywallView(context: ctx)
            }
            .onChange(of: model.paywallContext?.id) { _, _ in
                if let ctx = model.paywallContext {
                    paywallContext = ctx
                }
            }
            .onChange(of: model.shouldShowPaywall) { _, show in
                if show, paywallContext == nil {
                    paywallContext = model.paywallContext ?? .credits()
                }
            }
            .onChange(of: photoPickerItem) { _, item in
                guard let item else { return }
                Task { await handlePhotoSelection(item) }
            }
            .onAppear {
                if let initialURL, !initialURL.isEmpty, model.url.isEmpty {
                    model.url = initialURL
                }
                if let initialUserText, !initialUserText.isEmpty, model.userText == nil {
                    model.userText = initialUserText
                }
                if !linkImportEnabled, photoImportEnabled {
                    model.inputMode = .photo
                }
                attemptAutoStartIfNeeded()
            }
            .onDisappear { model.cancelActiveWork() }
        }
    }

    private var processingMessage: String {
        switch model.pollProgress {
        case "listening_to_video":
            "Transcribing spoken ingredients and steps."
        case "extracting":
            "Mapping ingredients and steps into a recipe."
        case "reading_page":
            "Reading the source and looking for a recipe."
        default:
            AIFeature.importRecipe.message
        }
    }

    private var processingTitle: String? {
        switch model.pollProgress {
        case "listening_to_video":
            "Listening to the video…"
        default:
            nil
        }
    }

    /// Share handoff: land on processing (or consent/paywall) without an Import tap.
    private func attemptAutoStartIfNeeded() {
        guard autoStart, !didAutoStart else { return }
        guard linkImportEnabled else { return }
        let trimmed = model.url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        didAutoStart = true
        model.inputMode = .link
        if env.session.credits < creditCost {
            paywallContext = .credits()
            return
        }
        consent.presentIfNeeded(session: env.session) {
            model.submit(api: env.api, session: env.session)
        }
    }

    private var idleContent: some View {
        ScrollView {
            VStack(spacing: 16) {
                if photoImportEnabled, linkImportEnabled {
                    Picker("Import source", selection: $model.inputMode) {
                        ForEach(ImportRecipeViewModel.ImportInputMode.allCases) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                switch model.inputMode {
                case .link:
                    linkInputContent
                case .photo:
                    photoInputContent
                }
            }
        }
    }

    private var linkInputContent: some View {
        VStack(spacing: 16) {
            TextField("Recipe URL", text: $model.url)
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("Recipe URL")
            Text(supportedSourcesCaption)
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

    private var photoInputContent: some View {
        VStack(spacing: 16) {
            Text("Choose a clear screenshot or photo of a recipe with ingredients and steps visible.")
                .rationCaption()
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
            PhotosPicker(selection: $photoPickerItem, matching: .images) {
                Label("Choose photo", systemImage: "photo.on.rectangle.angled")
            }
            .buttonStyle(SecondaryButtonStyle())
            Text("JPEG, PNG, or WebP · max 3MB")
                .rationCaption()
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var importIntroDetail: String {
        let sources = supportedSourcePhrases
        let sourceText: String
        if sources.isEmpty {
            sourceText = "recipe links and photos"
        } else if sources.count == 1 {
            sourceText = sources[0]
        } else if sources.count == 2 {
            sourceText = "\(sources[0]) and \(sources[1])"
        } else {
            sourceText = "\(sources.dropLast().joined(separator: ", ")), and \(sources.last!)"
        }
        return "Bring a recipe into Galley from \(sourceText). Ration extracts ingredients and directions so you can review before saving."
    }

    private var supportedSourcePhrases: [String] {
        var phrases: [String] = []
        if clientFlags.isAiImportWebEnabled {
            phrases.append("recipe websites")
        }
        if clientFlags.isAiImportSocialEnabled {
            phrases.append("TikTok, YouTube, and Instagram links")
        }
        if clientFlags.isAiImportPhotoEnabled {
            phrases.append("recipe screenshots or photos")
        }
        return phrases
    }

    private var supportedSourcesCaption: String {
        let phrases = supportedSourcePhrases
        guard !phrases.isEmpty else {
            return "Paste an HTTPS link to a page with ingredients and directions."
        }
        if phrases.count == 1 {
            return "Works with \(phrases[0])."
        }
        return "Works with \(phrases.dropLast().joined(separator: ", ")), and \(phrases.last!)."
    }

    private var capturingContent: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(Theme.hyperGreen)
            Text("Loading page on your device…")
                .rationHeadline()
            Text("This site blocked our servers. Trying again with your connection (uses \(creditCost) credits if extraction starts).")
                .rationCaption()
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    private func softFailToPhotoContent(_ message: String) -> some View {
        VStack(spacing: 12) {
            ErrorBanner(message: message)
            if photoImportEnabled {
                Button("Import from screenshot") {
                    model.switchToPhotoImport()
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            Button("Try again") { model.reset() }
                .buttonStyle(SecondaryButtonStyle())
            Button("Add meal manually") {
                dismiss()
                onAddManually()
            }
            .buttonStyle(SecondaryButtonStyle())
        }
    }

    private func siteBlockedContent(_ message: String) -> some View {
        VStack(spacing: 12) {
            ErrorBanner(message: message)
            Text("Why this happened")
                .rationHeadline()
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("Many recipe publishers block automated downloads. Your phone can sometimes open the page when our servers cannot. If that still fails, open the recipe in Safari and add it manually.")
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

    private func verificationContent(
        _ extracted: ExtractedRecipePreview,
        requestId: String,
        softFailToPhoto: Bool
    ) -> some View {
        VStack(spacing: 16) {
            GlassCard {
                VStack(alignment: .leading, spacing: 8) {
                    Text(extracted.completenessLabel)
                        .rationCaption()
                        .foregroundStyle(Theme.hyperGreen)
                    Text("Review import").rationHeadline()
                    Text(extracted.name.capitalized).rationBody()
                    Text(verificationSummary(extracted, softFailToPhoto: softFailToPhoto))
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                    if !extracted.evidenceLabels.isEmpty {
                        Text(extracted.evidenceLabels.joined(separator: " · "))
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                    }
                    if let source = extracted.sourceUrl ?? (model.url.isEmpty ? nil : model.url),
                       let url = URL(string: source) {
                        Link(destination: url) {
                            Label("View source", systemImage: "arrow.up.right.square")
                        }
                        .font(Typography.caption())
                        .foregroundStyle(Theme.hyperGreen)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button("Add to Galley") {
                Task {
                    await model.confirm(
                        requestId: requestId,
                        api: env.api,
                        isCrewMember: env.session.isCrewMember
                    )
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            if extracted.completeness == "link_holder",
               softFailToPhoto,
               photoImportEnabled
            {
                Button("Try a screenshot instead") {
                    model.switchToPhotoImport()
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
    }

    private func verificationSummary(
        _ extracted: ExtractedRecipePreview,
        softFailToPhoto: Bool
    ) -> String {
        if extracted.completeness == "link_holder" {
            if softFailToPhoto {
                return "We couldn't hear a recipe in this video. Source link saved — try a screenshot if the steps are on screen."
            }
            return "We saved the source link. Add ingredients later, or open the link for the full recipe."
        }
        let ingredientWord = extracted.ingredientCount == 1 ? "ingredient" : "ingredients"
        var summary = "\(extracted.ingredientCount) \(ingredientWord)"
        if let missing = extracted.missingAmountCount, missing > 0 {
            summary += " (\(missing) missing amounts)"
        }
        if let steps = extracted.stepCount {
            let stepWord = steps == 1 ? "step" : "steps"
            summary += ", \(steps) \(stepWord)"
        }
        if extracted.completeness == "skeleton" {
            return "Partial recipe: \(summary). Review and add to Galley?"
        }
        return "\(summary) extracted. Add to your Galley?"
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

    private func handlePhotoSelection(_ item: PhotosPickerItem) async {
        defer { photoPickerItem = nil }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                model.fail(with: ImportRecipeViewModel.PhotoPrepError.unreadable.localizedDescription)
                return
            }
            consent.presentIfNeeded(session: env.session) {
                model.submitPhoto(data: data, api: env.api, session: env.session)
            }
        } catch {
            model.fail(with: error.localizedDescription)
        }
    }
}
