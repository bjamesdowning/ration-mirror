import SwiftUI
import UIKit

enum CopilotTranscriptScrollPolicy {
    static func distanceFromBottom(
        contentHeight: CGFloat,
        visibleBottom: CGFloat,
        bottomInset: CGFloat
    ) -> CGFloat {
        max(0, contentHeight + bottomInset - visibleBottom)
    }
}

struct CopilotTranscriptScrollObserver: UIViewRepresentable {
    let onUserDistanceFromBottomChange: (CGFloat) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onUserDistanceFromBottomChange: onUserDistanceFromBottomChange)
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isUserInteractionEnabled = false
        context.coordinator.scheduleAttach(from: view)
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        context.coordinator.onUserDistanceFromBottomChange = onUserDistanceFromBottomChange
        context.coordinator.scheduleAttach(from: view)
    }

    final class Coordinator: NSObject {
        var onUserDistanceFromBottomChange: (CGFloat) -> Void
        private weak var scrollView: UIScrollView?
        private var offsetObservation: NSKeyValueObservation?

        init(onUserDistanceFromBottomChange: @escaping (CGFloat) -> Void) {
            self.onUserDistanceFromBottomChange = onUserDistanceFromBottomChange
        }

        func scheduleAttach(from view: UIView) {
            DispatchQueue.main.async { [weak self, weak view] in
                guard let self, let view, self.offsetObservation == nil else { return }
                var ancestor: UIView? = view.superview
                while let current = ancestor {
                    if let scrollView = current as? UIScrollView {
                        self.bind(to: scrollView)
                        return
                    }
                    ancestor = current.superview
                }
            }
        }

        private func bind(to scrollView: UIScrollView) {
            self.scrollView = scrollView
            offsetObservation = scrollView.observe(
                \.contentOffset,
                options: [.new]
            ) { [weak self] scrollView, _ in
                guard scrollView.isTracking
                    || scrollView.isDragging
                    || scrollView.isDecelerating
                    || UIAccessibility.isVoiceOverRunning else {
                    return
                }
                self?.onUserDistanceFromBottomChange(
                    Self.distanceFromBottom(of: scrollView)
                )
            }
        }

        private static func distanceFromBottom(of scrollView: UIScrollView) -> CGFloat {
            CopilotTranscriptScrollPolicy.distanceFromBottom(
                contentHeight: scrollView.contentSize.height,
                visibleBottom: scrollView.contentOffset.y + scrollView.bounds.height,
                bottomInset: scrollView.adjustedContentInset.bottom
            )
        }

        deinit {
            offsetObservation?.invalidate()
        }
    }
}
