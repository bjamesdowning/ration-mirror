import SwiftUI

/// Inline intro copy + credit disclaimer for unified AI flows (intro and inputs on one screen).
struct AIFeatureInlineIntro: View {
    let title: String
    let detail: String
    let creditCost: Int
    var costLabel: String = "per use"
    var nextSteps: String?
    var hint: String? = nil

    static let nutritionHint = "Nutrition (when available): USDA match first; AI estimates are labelled—edit before saving."
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .font(Typography.heroIcon(28))
                    .foregroundStyle(Theme.hyperGreen)
                Text(title).rationTitle()
            }

            Text(detail)
                .rationBody()
                .foregroundStyle(Theme.carbon.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)

            if let nextSteps {
                GlassCard {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("What happens next").rationHeadline()
                        Text(nextSteps)
                            .rationCaption()
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            if let hint {
                Text(hint)
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text("Uses \(creditCost) credit\(creditCost == 1 ? "" : "s") \(costLabel). You have \(env.session.credits).")
                .rationCaption()

            Text("AI-generated results are suggestions only. Always review before saving.")
                .rationCaption()
                .fixedSize(horizontal: false, vertical: true)

            Link("Terms of Service", destination: AppConfig.termsURL)
                .font(Typography.caption())
                .foregroundStyle(Theme.hyperGreen)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct AIFeaturePrimaryButton: View {
    let label: String
    let creditCost: Int
    var isDisabled: Bool = false
    let action: () -> Void
    @Environment(AppEnvironment.self) private var env
    @State private var showingPaywall = false

    var body: some View {
        Button(label) {
            if env.session.credits >= creditCost {
                Haptics.light()
                action()
            } else {
                showingPaywall = true
            }
        }
        .buttonStyle(AIButtonStyle())
        .disabled(isDisabled)
        .sheet(isPresented: $showingPaywall) {
            PaywallView(context: .credits())
        }
    }
}
