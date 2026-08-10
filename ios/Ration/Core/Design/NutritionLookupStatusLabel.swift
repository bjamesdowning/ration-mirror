import SwiftUI

/// Pulsing status while scan / dock review resolves nutrients in the background.
struct NutritionLookupStatusLabel: View {
    enum Kind {
        case loading
        case failed(dock: Bool)
    }

    let kind: Kind
    @State private var pulse = false

    var body: some View {
        switch kind {
        case .loading:
            Text("Looking up nutrients…")
                .rationCaption()
                .foregroundStyle(Theme.hyperGreen)
                .opacity(pulse ? 0.45 : 1)
                .animation(
                    .easeInOut(duration: 0.9).repeatForever(autoreverses: true),
                    value: pulse
                )
                .onAppear { pulse = true }
                .accessibilityLabel("Looking up nutrients")
        case let .failed(dock):
            Text(
                dock
                    ? "Nutrition unavailable — will retry when you dock."
                    : "Nutrition unavailable — will retry when you add items."
            )
            .rationCaption()
            .foregroundStyle(Theme.muted)
        }
    }
}
