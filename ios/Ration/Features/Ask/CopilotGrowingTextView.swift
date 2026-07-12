import SwiftUI
import UIKit

enum CopilotComposerHeightPolicy {
    static let singleLineHeight: CGFloat = 44
    static let maxHeight: CGFloat = 120
    static let verticalInset: CGFloat = 11
    static let minimumMeasurementWidth: CGFloat = 32

    static func clampedHeight(for contentHeight: CGFloat) -> CGFloat {
        min(maxHeight, max(singleLineHeight, contentHeight))
    }

    static func measuredContentHeight(for textView: UITextView, width: CGFloat) -> CGFloat {
        let fitting = textView.sizeThatFits(
            CGSize(width: width, height: .greatestFiniteMagnitude)
        )
        return clampedHeight(for: fitting.height)
    }

    static func shouldDeferMeasurement(width: CGFloat) -> Bool {
        width < minimumMeasurementWidth
    }
}

private final class CopilotTextView: UITextView {
    private(set) var isPerformingPaste = false
    private weak var lockedScrollView: UIScrollView?
    private var lockedScrollEnabled = true

    override func paste(_ sender: Any?) {
        isPerformingPaste = true
        defer { isPerformingPaste = false }
        super.paste(sender)
    }

    override func becomeFirstResponder() -> Bool {
        let became = super.becomeFirstResponder()
        if became {
            lockAncestorScrolling()
        }
        return became
    }

    override func resignFirstResponder() -> Bool {
        let resigned = super.resignFirstResponder()
        if resigned {
            unlockAncestorScrolling()
        }
        return resigned
    }

    private func lockAncestorScrolling() {
        guard lockedScrollView == nil else { return }
        var ancestor: UIView? = superview
        while let current = ancestor {
            if let scrollView = current as? UIScrollView {
                lockedScrollView = scrollView
                lockedScrollEnabled = scrollView.isScrollEnabled
                scrollView.isScrollEnabled = false
                return
            }
            ancestor = current.superview
        }
    }

    private func unlockAncestorScrolling() {
        guard let scrollView = lockedScrollView else { return }
        scrollView.isScrollEnabled = lockedScrollEnabled
        lockedScrollView = nil
    }
}

private final class CopilotComposerContainerView: UIView {
    let textView = CopilotTextView()
    let placeholderLabel = UILabel()
    var onDidLayout: ((UITextView) -> Void)?
    private var lastReportedLayoutWidth: CGFloat = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        placeholderLabel.numberOfLines = 0
        placeholderLabel.textColor = .secondaryLabel
        placeholderLabel.isUserInteractionEnabled = false
        addSubview(textView)
        addSubview(placeholderLabel)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let bounds = self.bounds
        textView.frame = bounds
        let inset = UIEdgeInsets(
            top: CopilotComposerHeightPolicy.verticalInset,
            left: 0,
            bottom: CopilotComposerHeightPolicy.verticalInset,
            right: 0
        )
        placeholderLabel.frame = bounds.inset(by: inset)

        let width = bounds.width
        guard !CopilotComposerHeightPolicy.shouldDeferMeasurement(width: width) else { return }
        guard abs(width - lastReportedLayoutWidth) > 0.5 else { return }
        lastReportedLayoutWidth = width
        onDidLayout?(textView)
    }

    func updatePlaceholderVisibility() {
        placeholderLabel.isHidden = !textView.text.isEmpty
    }
}

struct CopilotGrowingTextView: UIViewRepresentable {
    @Binding var text: String
    let placeholder: String
    let isEnabled: Bool
    let focusToken: Int
    let dismissToken: Int
    let showsKeyboardDismissAccessory: Bool
    let onFocusChange: (Bool) -> Void
    let onHeightChange: (CGFloat) -> Void
    let onSubmit: () -> Void
    let onDismissKeyboard: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> UIView {
        let container = CopilotComposerContainerView()
        let textView = container.textView
        textView.delegate = context.coordinator
        textView.backgroundColor = .clear
        textView.textColor = .label
        textView.tintColor = UIColor(red: 0, green: 0.88, blue: 0.53, alpha: 1)
        textView.returnKeyType = .send
        textView.enablesReturnKeyAutomatically = true
        textView.isScrollEnabled = false
        textView.textContainerInset = UIEdgeInsets(
            top: CopilotComposerHeightPolicy.verticalInset,
            left: 0,
            bottom: CopilotComposerHeightPolicy.verticalInset,
            right: 0
        )
        textView.textContainer.lineFragmentPadding = 0
        textView.adjustsFontForContentSizeCategory = true
        textView.font = scaledBodyFont
        textView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        textView.setContentHuggingPriority(.defaultLow, for: .vertical)
        container.placeholderLabel.font = scaledBodyFont
        container.onDidLayout = { [weak coordinator = context.coordinator] textView in
            coordinator?.reportHeight(for: textView)
        }
        context.coordinator.applyPlaceholder(to: container)
        context.coordinator.syncAccessory(on: textView)
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        guard let container = uiView as? CopilotComposerContainerView else { return }
        context.coordinator.parent = self
        let textView = container.textView

        if textView.text != text {
            if text.isEmpty || !textView.isFirstResponder {
                textView.text = text
            }
        }

        textView.isEditable = isEnabled
        textView.isSelectable = isEnabled
        textView.font = scaledBodyFont
        container.placeholderLabel.font = scaledBodyFont
        context.coordinator.applyPlaceholder(to: container)
        context.coordinator.syncAccessory(on: textView)

        if focusToken != context.coordinator.lastFocusToken {
            context.coordinator.lastFocusToken = focusToken
            if focusToken > 0 {
                DispatchQueue.main.async {
                    textView.becomeFirstResponder()
                }
            }
        }

        if dismissToken != context.coordinator.lastDismissToken {
            context.coordinator.lastDismissToken = dismissToken
            context.coordinator.lastFocusToken = 0
            if textView.isFirstResponder {
                textView.resignFirstResponder()
            }
        }

        container.updatePlaceholderVisibility()
        if !CopilotComposerHeightPolicy.shouldDeferMeasurement(width: container.bounds.width) {
            context.coordinator.reportHeight(for: textView, containerWidth: container.bounds.width)
        }
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: CopilotGrowingTextView
        var lastFocusToken = 0
        var lastDismissToken = 0
        private var lastReportedHeight: CGFloat = CopilotComposerHeightPolicy.singleLineHeight
        private var accessoryView: CopilotKeyboardDismissAccessoryView?

        init(parent: CopilotGrowingTextView) {
            self.parent = parent
        }

        fileprivate func applyPlaceholder(to container: CopilotComposerContainerView) {
            container.placeholderLabel.text = parent.placeholder
            container.updatePlaceholderVisibility()
        }

        func syncAccessory(on textView: UITextView) {
            guard parent.showsKeyboardDismissAccessory else {
                if textView.inputAccessoryView != nil {
                    textView.inputAccessoryView = nil
                    textView.reloadInputViews()
                }
                accessoryView = nil
                return
            }

            if accessoryView == nil {
                accessoryView = CopilotKeyboardDismissAccessoryView { [weak self] in
                    self?.parent.onDismissKeyboard()
                }
            }
            if textView.inputAccessoryView !== accessoryView {
                textView.inputAccessoryView = accessoryView
                textView.reloadInputViews()
            }
        }

        func reportHeight(for textView: UITextView, containerWidth: CGFloat? = nil) {
            let width = max(
                textView.bounds.width,
                containerWidth ?? (textView.superview as? CopilotComposerContainerView)?.bounds.width ?? 0
            )
            guard !CopilotComposerHeightPolicy.shouldDeferMeasurement(width: width) else { return }
            let height = CopilotComposerHeightPolicy.measuredContentHeight(
                for: textView,
                width: width
            )
            textView.isScrollEnabled = height >= CopilotComposerHeightPolicy.maxHeight - 0.5
            guard abs(height - lastReportedHeight) > 0.5 else { return }
            lastReportedHeight = height
            parent.onHeightChange(height)
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            (textView.superview as? CopilotComposerContainerView)?.updatePlaceholderVisibility()
            parent.onFocusChange(true)
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            parent.onFocusChange(false)
            (textView.superview as? CopilotComposerContainerView)?.updatePlaceholderVisibility()
            reportHeight(for: textView)
        }

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
            (textView.superview as? CopilotComposerContainerView)?.updatePlaceholderVisibility()
            reportHeight(for: textView)
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
