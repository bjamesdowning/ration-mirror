import SwiftUI

/// First onboarding screen — brand-led promise before feature enablement.
struct OnboardingWelcomeView: View {
    let onContinue: () -> Void

    private static let capabilities = [
        "Scan receipts, fridge photos, and PDFs straight into your pantry",
        "Import meals from TikTok, YouTube, websites, or a photo",
        "Run multiple kitchens and invite others to join them",
        "Set nutrient goals and log intake privately — even in a shared kitchen",
        "Ask Copilot with full context on your kitchen",
    ]

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .center, spacing: 16) {
                    Image("RationMark")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 56, height: 56)
                        .accessibilityHidden(true)

                    Text("Ration")
                        .font(.title.bold())
                        .foregroundStyle(Theme.carbon)

                    Text("Waste less. Shop the delta.")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.hyperGreen)

                    Text(
                        "Pantry, recipes, shopping, and macros in one loop — grounded in what you have and eat."
                    )
                    .font(.body)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)

                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Self.capabilities, id: \.self) { line in
                            capabilityRow(line)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 8)
                }
                .padding(24)
            }

            Button("Continue", action: onContinue)
                .buttonStyle(PrimaryButtonStyle())
                .padding(24)
        }
        .background(Theme.ceramic)
        .accessibilityElement(children: .contain)
    }

    private func capabilityRow(_ line: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(Theme.hyperGreen)
                .frame(width: 6, height: 6)
                .padding(.top, 5)
            Text(line)
                .font(.caption)
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
