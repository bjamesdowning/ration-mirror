import SwiftUI
import UIKit

private final class CopilotTextView: UITextView {
    private(set) var isPerformingPaste = false

    override func paste(_ sender: Any?) {
        isPerformingPaste = true
        defer { isPerformingPaste = false }
        super.paste(sender)
    }
}

struct CopilotGrowingTextView: UIViewRepresentable {
    @Binding var text: String
    @Binding var isFocused: Bool
    let isEnabled: Bool
    let onSubmit: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> UITextView {
        let textView = CopilotTextView()
        textView.delegate = context.coordinator
        textView.backgroundColor = .clear
        textView.textColor = .label
        textView.tintColor = UIColor(red: 0, green: 0.88, blue: 0.53, alpha: 1)
        textView.returnKeyType = .send
        textView.enablesReturnKeyAutomatically = true
        textView.isScrollEnabled = true
        textView.textContainerInset = UIEdgeInsets(top: 11, left: 0, bottom: 11, right: 0)
        textView.textContainer.lineFragmentPadding = 0
        textView.adjustsFontForContentSizeCategory = true
        textView.font = scaledBodyFont
        textView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return textView
    }

    func updateUIView(_ textView: UITextView, context: Context) {
        context.coordinator.parent = self
        if textView.text != text {
            textView.text = text
        }
        textView.isEditable = isEnabled
        textView.isSelectable = isEnabled
        textView.font = scaledBodyFont

        if isFocused, !textView.isFirstResponder {
            DispatchQueue.main.async {
                textView.becomeFirstResponder()
            }
        } else if !isFocused, textView.isFirstResponder {
            textView.resignFirstResponder()
        }
    }

    func sizeThatFits(
        _ proposal: ProposedViewSize,
        uiView: UITextView,
        context _: Context
    ) -> CGSize? {
        guard let width = proposal.width else { return nil }
        let fitting = uiView.sizeThatFits(
            CGSize(width: width, height: .greatestFiniteMagnitude)
        )
        return CGSize(width: width, height: min(120, max(44, fitting.height)))
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: CopilotGrowingTextView

        init(parent: CopilotGrowingTextView) {
            self.parent = parent
        }

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            if !parent.isFocused {
                parent.isFocused = true
            }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            if parent.isFocused {
                parent.isFocused = false
            }
        }

        func textView(
            _ textView: UITextView,
            shouldChangeTextIn range: NSRange,
            replacementText text: String
        ) -> Bool {
            let isPasting = (textView as? CopilotTextView)?.isPerformingPaste ?? false
            guard CopilotComposerInputPolicy.shouldSubmit(
                replacementText: text,
                isPasting: isPasting
            ) else {
                return true
            }
            parent.onSubmit()
            return false
        }
    }

    private var scaledBodyFont: UIFont {
        let base = UIFont(name: "SpaceMono-Regular", size: 15)
            ?? UIFont.systemFont(ofSize: 15)
        return UIFontMetrics(forTextStyle: .body).scaledFont(for: base)
    }
}
