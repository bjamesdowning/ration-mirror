import CoreGraphics

enum CopilotKeyboardDismissPolicy {
    static let minimumDismissDistance: CGFloat = 24

    static func isVerticalDownDrag(translation: CGSize) -> Bool {
        translation.height > 0
            && abs(translation.height) > abs(translation.width)
    }

    static func shouldDismissKeyboard(translation: CGSize) -> Bool {
        isVerticalDownDrag(translation: translation)
            && translation.height >= minimumDismissDistance
    }

    static func dismissProgress(translation: CGFloat, keyboardHeight: CGFloat) -> CGFloat {
        guard keyboardHeight > 0, translation > 0 else { return 0 }
        return min(1, translation / keyboardHeight)
    }
}
