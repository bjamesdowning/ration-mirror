import SwiftUI

/// Credits gate before AI features — web parity intro with cost label, disclaimer, pricing CTA.
struct AIFeatureIntroView: View {
    let title: String
    let detail: String
    let creditCost: Int
    var costLabel: String = "per use"
    var confirmLabel: String = "Continue"
    var nextSteps: String?
    let onContinue: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppEnvironment.self) private var env
    @State private var showingPaywall = false

    private var hasEnoughCredits: Bool {
        env.session.credits >= creditCost
    }

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "sparkles")
                .font(.system(size: 40))
                .foregroundStyle(Theme.hyperGreen)
            Text(title).rationTitle()
            Text(detail)
                .rationBody()
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.carbon.opacity(0.85))

            if let nextSteps {
                GlassCard {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("What happens next").rationHeadline()
                        Text(nextSteps).rationCaption()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            Text("Uses \(creditCost) credit\(creditCost == 1 ? "" : "s") \(costLabel).")
                .rationCaption()
            Text("You have \(env.session.credits) credit\(env.session.credits == 1 ? "" : "s").")
                .rationCaption()

            GlassCard {
                HStack {
                    Text("Cost").rationBody()
                    Spacer()
                    Text("\(creditCost) credits").rationHeadline()
                }
            }

            Text("AI-generated results are suggestions only. Always review before saving.")
                .rationCaption()
                .multilineTextAlignment(.center)
            Link("Terms of Service", destination: AppConfig.termsURL)
                .font(Typography.caption())
                .foregroundStyle(Theme.hyperGreen)

            if hasEnoughCredits {
                Button(confirmLabel) {
                    Haptics.light()
                    onContinue()
                }
                .buttonStyle(PrimaryButtonStyle())
            } else {
                Button("Get credits") {
                    showingPaywall = true
                }
                .buttonStyle(PrimaryButtonStyle())
            }

            Button("Cancel") { dismiss() }
                .buttonStyle(SecondaryButtonStyle())
        }
        .padding(24)
        .background(Theme.ceramic)
        .sheet(isPresented: $showingPaywall) {
            PaywallView()
        }
    }
}
