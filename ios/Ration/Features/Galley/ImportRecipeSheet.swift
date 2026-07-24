import SwiftUI
import Observation

struct ImportRecipeSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = ImportRecipeViewModel()
    @State private var consent = AIConsentCoordinator()
    @State private var paywallContext: PaywallContext?
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
            .onDisappear { model.cancelActiveWork() }
        }
    }

    private var idleContent: some View {
        ScrollView {
            VStack(spacing: 16) {
                AIFeatureInlineIntro(
                    title: "Import recipe",
                    detail: "Paste an HTTPS recipe webpage URL and Ration extracts ingredients and directions into Galley. Video links and non-recipe pages aren’t supported. Some sites block automated imports — if so, Ration will try loading the page on your device; if that fails too, add the meal manually.",
                    creditCost: creditCost,
                    costLabel: "per import",
                    nextSteps: "Review the imported meal before adding to Galley."
                )
                TextField("Recipe URL", text: $model.url)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .textFieldStyle(.roundedBorder)
                Text("Needs a recipe page with ingredients and steps — not a video link. If a site blocks bots, you’ll get a device reload or manual entry next step.")
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
                Task {
                    await model.confirm(
                        requestId: requestId,
                        api: env.api,
                        isCrewMember: env.session.isCrewMember
                    )
                }
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
