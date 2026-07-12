import UIKit

/// Native keyboard accessory toolbar with a Done affordance (standard iOS pattern).
final class CopilotKeyboardDismissAccessoryView: UIView {
    private let onDone: () -> Void

    init(onDone: @escaping () -> Void) {
        self.onDone = onDone
        let width = UIScreen.main.bounds.width
        super.init(frame: CGRect(x: 0, y: 0, width: width, height: 44))
        backgroundColor = .secondarySystemBackground
        isUserInteractionEnabled = true

        let toolbar = UIToolbar(frame: bounds)
        toolbar.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        let flex = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        let done = UIBarButtonItem(
            title: "Done",
            style: .done,
            target: self,
            action: #selector(doneTapped)
        )
        done.tintColor = UIColor(red: 0, green: 0.88, blue: 0.53, alpha: 1)
        toolbar.items = [flex, done]
        addSubview(toolbar)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    @objc private func doneTapped() {
        onDone()
    }
}
