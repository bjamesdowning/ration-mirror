import SwiftUI

enum CopilotComposerHeightPolicy {
    /// Minimum single-line field height inside the composer capsule.
    static let minHeight: CGFloat = 36
    /// Soft wrap grows through this many lines, then scrolls inside the field.
    static let maxLineCount = 10
}

/// SwiftUI-native growing composer field — shared by tab dock and Ask sheet.
struct CopilotNativeComposer: View {
    enum Layout {
        case compact
        case growing
    }

    @Binding var text: String
    @FocusState.Binding var isFocused: Bool
    let placeholder: String
    let isEnabled: Bool
    var layout: Layout = .growing
    let onSubmit: () -> Void
    let onFocusChange: (Bool) -> Void

    private var usesGrowingAxis: Bool {
        layout == .growing || text.contains("\n") || text.contains("\r")
    }

    var body: some View {
        Group {
            if usesGrowingAxis {
                TextField(placeholder, text: $text, axis: .vertical)
                    .lineLimit(1...CopilotComposerHeightPolicy.maxLineCount)
                    // Claim intrinsic height inside HStack so the field grows with wrap.
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                TextField(placeholder, text: $text)
                    .lineLimit(1)
            }
        }
        .focused($isFocused)
        .disabled(!isEnabled)
        .font(Typography.body())
        .foregroundStyle(Theme.carbon)
        .tint(Theme.hyperGreen)
        .submitLabel(.return)
        .onSubmit {
            // Multiline / growing: Return inserts a newline. Compact dock: Return sends.
            if !usesGrowingAxis {
                onSubmit()
            }
        }
        .onChange(of: isFocused) { _, focused in
            onFocusChange(focused)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(minHeight: CopilotComposerHeightPolicy.minHeight, alignment: .center)
    }
}
