import SwiftUI

enum CopilotComposerHeightPolicy {
    static let singleLineHeight: CGFloat = 44
    static let maxHeight: CGFloat = 120
    static let maxLineCount = 5

    static func clampedHeight(for measured: CGFloat) -> CGFloat {
        min(maxHeight, max(singleLineHeight, measured))
    }
}

/// SwiftUI-native growing composer field — shared by tab dock and Ask sheet.
struct CopilotNativeComposer: View {
    @Binding var text: String
    @FocusState.Binding var isFocused: Bool
    let placeholder: String
    let isEnabled: Bool
    let onSubmit: () -> Void
    let onFocusChange: (Bool) -> Void

    @State private var contentHeight = CopilotComposerHeightPolicy.singleLineHeight

    var body: some View {
        TextField(placeholder, text: $text, axis: .vertical)
            .lineLimit(1...CopilotComposerHeightPolicy.maxLineCount)
            .focused($isFocused)
            .disabled(!isEnabled)
            .font(Typography.body())
            .foregroundStyle(Theme.carbon)
            .tint(Theme.hyperGreen)
            .submitLabel(.send)
            .onSubmit(onSubmit)
            .onChange(of: isFocused) { _, focused in
                onFocusChange(focused)
            }
            .background {
                GeometryReader { geometry in
                    Color.clear.preference(
                        key: CopilotComposerMeasuredHeightKey.self,
                        value: measuredHeight(width: geometry.size.width)
                    )
                }
            }
            .onPreferenceChange(CopilotComposerMeasuredHeightKey.self) { height in
                contentHeight = height
            }
            .frame(height: contentHeight, alignment: .top)
    }

    private func measuredHeight(width: CGFloat) -> CGFloat {
        guard width > 32 else { return CopilotComposerHeightPolicy.singleLineHeight }
        let font = UIFont(name: "SpaceMono-Regular", size: 15)
            ?? UIFont.systemFont(ofSize: 15)
        let scaled = UIFontMetrics(forTextStyle: .body).scaledFont(for: font)
        let attributes: [NSAttributedString.Key: Any] = [.font: scaled]
        let constraint = CGSize(width: width, height: .greatestFiniteMagnitude)
        let sample = text.isEmpty ? " " : text
        let rect = (sample as NSString).boundingRect(
            with: constraint,
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attributes,
            context: nil
        )
        return CopilotComposerHeightPolicy.clampedHeight(for: ceil(rect.height) + 22)
    }
}

private struct CopilotComposerMeasuredHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = CopilotComposerHeightPolicy.singleLineHeight

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
