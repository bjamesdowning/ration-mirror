import SwiftUI

/// Shared Done toolbar for decimal-pad fields without a return key.
struct RationFormKeyboardToolbar: ViewModifier {
    var onDone: () -> Void

    func body(content: Content) -> some View {
        content
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done", action: onDone)
                }
            }
    }
}

extension View {
    func rationFormKeyboardToolbar(onDone: @escaping () -> Void = {}) -> some View {
        modifier(RationFormKeyboardToolbar(onDone: onDone))
    }
}
