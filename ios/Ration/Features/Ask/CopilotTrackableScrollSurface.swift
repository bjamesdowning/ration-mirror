import SwiftUI

/// Wraps non-list empty/error content in a scroll surface so Copilot dock collapse works consistently.
struct CopilotTrackableScrollSurface<Content: View>: View {
    let tab: Int
    let isActive: Bool
    var hasTabAction: Bool = true
    @ViewBuilder let content: () -> Content

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                content()
                    .frame(maxWidth: .infinity, minHeight: geometry.size.height + 1)
            }
            .scrollDismissesKeyboard(.interactively)
            .copilotDockScrollMargins(hasTabAction: hasTabAction)
            .copilotScrollTracked(tab: tab, isActive: isActive)
        }
    }
}

extension View {
    func copilotTrackableScrollSurface(
        tab: Int,
        isActive: Bool,
        hasTabAction: Bool = true
    ) -> some View {
        CopilotTrackableScrollSurface(
            tab: tab,
            isActive: isActive,
            hasTabAction: hasTabAction,
            content: { self }
        )
    }
}
