import SwiftUI
import UIKit

/// Shared keyboard dismiss toolbar for decimal-pad fields without a return key.
/// Attach once on a `Form` or outer container — never on `ForEach` or per-row content,
/// or SwiftUI will stack one accessory button per child.
struct RationFormKeyboardToolbar: ViewModifier {
    var onDismiss: () -> Void

    func body(content: Content) -> some View {
        content
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button(action: onDismiss) {
                        Image(systemName: "chevron.down")
                            .foregroundStyle(Theme.hyperGreen)
                    }
                    .accessibilityLabel("Dismiss keyboard")
                }
            }
    }
}

extension View {
    /// Dismisses the keyboard via `onDismiss`, or resigns first responder when omitted.
    func rationFormKeyboardToolbar(onDismiss: (() -> Void)? = nil) -> some View {
        modifier(
            RationFormKeyboardToolbar(
                onDismiss: onDismiss ?? {
                    UIApplication.shared.sendAction(
                        #selector(UIResponder.resignFirstResponder),
                        to: nil,
                        from: nil,
                        for: nil
                    )
                }
            )
        )
    }
}
