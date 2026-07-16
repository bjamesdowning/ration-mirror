import SwiftUI

enum CopilotComposerHeightPolicy {
    static let singleLineHeight: CGFloat = 36
    static let maxHeight: CGFloat = 240
    static let maxLineCount = 10

    static func clampedHeight(for measured: CGFloat) -> CGFloat {
        min(maxHeight, max(singleLineHeight, measured))
    }

    static func measuredHeight(text: String, width: CGFloat) -> CGFloat {
        guard width > 32 else { return singleLineHeight }
        guard !text.isEmpty else { return singleLineHeight }

        let font = composerFont
        let lineHeight = ceil(font.lineHeight)
        // TextField chrome: singleLineHeight includes vertical padding beyond one line.
        let verticalPadding = max(0, singleLineHeight - lineHeight)

        let attributes: [NSAttributedString.Key: Any] = [.font: font]
        let constraint = CGSize(width: width, height: .greatestFiniteMagnitude)
        let rect = (text as NSString).boundingRect(
            with: constraint,
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attributes,
            context: nil
        )
        return clampedHeight(for: ceil(rect.height) + verticalPadding)
    }

    static var composerFont: UIFont {
        let font = UIFont(name: "SpaceMono-Regular", size: 15)
            ?? UIFont.systemFont(ofSize: 15)
        return UIFontMetrics(forTextStyle: .body).scaledFont(for: font)
    }
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

    @State private var contentHeight = CopilotComposerHeightPolicy.singleLineHeight

    private var usesGrowingAxis: Bool {
        layout == .growing || text.contains("\n") || text.contains("\r")
    }

    var body: some View {
        Group {
            if usesGrowingAxis {
                TextField(placeholder, text: $text, axis: .vertical)
                    .lineLimit(1...CopilotComposerHeightPolicy.maxLineCount)
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
        .background {
            GeometryReader { geometry in
                Color.clear.preference(
                    key: CopilotComposerMeasuredHeightKey.self,
                    value: CopilotComposerHeightPolicy.measuredHeight(
                        text: text,
                        width: geometry.size.width
                    )
                )
            }
        }
        .onPreferenceChange(CopilotComposerMeasuredHeightKey.self) { height in
            contentHeight = height
        }
        .frame(height: usesGrowingAxis ? contentHeight : nil, alignment: .top)
        .frame(minHeight: CopilotComposerHeightPolicy.singleLineHeight, alignment: .center)
    }
}

private struct CopilotComposerMeasuredHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = CopilotComposerHeightPolicy.singleLineHeight

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
