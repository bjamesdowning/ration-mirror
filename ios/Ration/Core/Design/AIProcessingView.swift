import SwiftUI

enum AIFeature: String {
    case generateMeals
    case planWeek
    case importRecipe
    case scanReceipt
    case supplyReplenish
    case copilot

    var icon: String {
        switch self {
        case .generateMeals, .copilot: "sparkles"
        case .planWeek: "calendar"
        case .importRecipe: "link"
        case .scanReceipt, .supplyReplenish: "camera.viewfinder"
        }
    }

    var title: String {
        switch self {
        case .generateMeals: "Generating meals…"
        case .planWeek: "Planning week…"
        case .importRecipe: "Importing recipe…"
        case .scanReceipt: "Scanning receipt…"
        case .supplyReplenish: "Matching receipt…"
        case .copilot: "Copilot is thinking…"
        }
    }

    var message: String {
        switch self {
        case .generateMeals:
            "Analyzing your Cargo and preferences to suggest recipes you'll actually cook."
        case .planWeek:
            "Building a balanced week from your Galley — matching what's already in Cargo."
        case .importRecipe:
            "Reading the recipe page and mapping ingredients to your inventory units."
        case .scanReceipt:
            "Extracting items from your receipt and matching them to Cargo entries."
        case .supplyReplenish:
            "Extracting items from your receipt and matching them to your Supply list."
        case .copilot:
            "Checking Ration context and preparing the next precise action."
        }
    }
}

/// Branded full-screen AI processing state with educational copy and credit reminder.
struct AIProcessingView: View {
    let feature: AIFeature
    var creditCost: Int?

    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 24) {
            ZStack {
                Circle()
                    .stroke(Theme.hyperGreen.opacity(0.25), lineWidth: 3)
                    .frame(width: 88, height: 88)
                    .scaleEffect(reduceMotion ? 1 : (pulse ? 1.08 : 0.92))
                    .animation(MotionPolicy.repeatingPulse(duration: 1.2), value: pulse)
                Image(systemName: feature.icon)
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(Theme.hyperGreen)
            }
            VStack(spacing: 8) {
                Text(feature.title).rationHeadline()
                Text(feature.message)
                    .rationCaption()
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.muted)
                    .padding(.horizontal, 24)
            }
            if let creditCost {
                Text("Uses \(creditCost) credit\(creditCost == 1 ? "" : "s")")
                    .rationCaption()
                    .foregroundStyle(Theme.hyperGreen)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.hyperGreen.opacity(0.12))
                    .clipShape(Capsule())
            }
            ProgressView().tint(Theme.hyperGreen)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.ceramic)
        .onAppear { pulse = true }
    }
}
