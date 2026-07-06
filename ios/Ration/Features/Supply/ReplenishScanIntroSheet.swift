import SwiftUI

/// Credit-gated intro before supply replenish scan — mirrors web `ReplenishScanIntroModal`.
struct ReplenishScanIntroSheet: View {
    let creditCost: Int
    let onContinue: () -> Void

    var body: some View {
        NavigationStack {
            AIFeatureIntroView(
                title: "Replenish from receipt",
                detail: "AI reads your receipt, matches lines to your Supply list, then docks purchased items to Cargo.",
                creditCost: creditCost,
                costLabel: "per scan",
                confirmLabel: "Continue",
                nextSteps: "Choose camera or upload a receipt image/PDF, then review matches before docking to Cargo.",
                onContinue: onContinue
            )
            .navigationTitle("Replenish from receipt")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
