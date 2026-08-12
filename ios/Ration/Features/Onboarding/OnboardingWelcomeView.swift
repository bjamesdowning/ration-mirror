import SwiftUI

/// First onboarding screen — branded welcome before feature enablement.
struct OnboardingWelcomeView: View {
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Welcome to Ration")
                        .font(.title.bold())
                        .foregroundStyle(Theme.carbon)

                    Text("Orbital Supply Chain")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.hyperGreen)

                    Text(
                        "Ration connects your pantry, recipes, and weekly meal plan so you always know what you have, what you can cook, and exactly what to buy."
                    )
                    .font(.body)
                    .foregroundStyle(Theme.muted)

                    VStack(alignment: .leading, spacing: 10) {
                        nomenclatureRow("Cargo", "Your pantry, tracked in real time.")
                        nomenclatureRow("Galley", "Recipes mapped to what you stock.")
                        nomenclatureRow("Manifest", "Your weekly meal plan.")
                        nomenclatureRow("Supply", "Shopping list from your Manifest.")
                    }
                    .padding(.top, 4)
                }
                .padding(24)
            }

            Button("Continue", action: onContinue)
                .buttonStyle(PrimaryButtonStyle())
                .padding(24)
        }
        .background(Theme.ceramic)
    }

    private func nomenclatureRow(_ term: String, _ def: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(term)
                .font(.caption.weight(.bold))
                .foregroundStyle(Theme.hyperGreen)
                .frame(width: 72, alignment: .leading)
            Text(def)
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }
}
