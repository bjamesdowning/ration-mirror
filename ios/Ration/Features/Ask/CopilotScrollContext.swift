import SwiftUI
import Observation
import UIKit

enum CopilotScrollDirection: Equatable {
    case up
    case down
    case idle
}

@MainActor
@Observable
final class CopilotScrollContext {
    private(set) var isExpanded = true
    private(set) var scrollDirection: CopilotScrollDirection = .idle
    private(set) var trackingGeneration = 0

    private var canAutoExpand = true
    private var lastOffset: CGFloat = 0
    private var lastProcessedAt: CFAbsoluteTime = 0
    private let collapseThreshold: CGFloat = 24
    private let scrollProcessInterval: CFAbsoluteTime = 0.05

    func setCanAutoExpand(_ value: Bool) {
        canAutoExpand = value
        if !value, !isExpanded {
            return
        }
        if value {
            isExpanded = true
        }
    }

    func resetForTabChange() {
        trackingGeneration += 1
        lastOffset = 0
        lastProcessedAt = 0
        scrollDirection = .idle
        isExpanded = canAutoExpand
    }

    func expandManually() {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
            isExpanded = true
        }
    }

    func collapse() {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
            isExpanded = false
        }
    }

    func reportScroll(offset: CGFloat) {
        let now = CFAbsoluteTimeGetCurrent()
        let delta = offset - lastOffset
        let direction: CopilotScrollDirection
        if delta > 1 {
            direction = .down
        } else if delta < -1 {
            direction = .up
        } else {
            return
        }

        lastOffset = offset

        let isCollapsing = direction == .down && offset > collapseThreshold && isExpanded
        let isExpanding = direction == .up && !isExpanded && canAutoExpand
        guard isCollapsing || isExpanding || now - lastProcessedAt >= scrollProcessInterval else {
            return
        }

        lastProcessedAt = now
        scrollDirection = direction

        if isCollapsing {
            collapse()
            return
        }

        if isExpanding {
            expandManually()
        }
    }
}

private struct CopilotScrollTracker: UIViewRepresentable {
    let trackingGeneration: Int
    let onOffsetChange: (CGFloat) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onOffsetChange: onOffsetChange)
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        context.coordinator.scheduleAttach(from: view, generation: trackingGeneration)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.scheduleAttach(from: uiView, generation: trackingGeneration)
    }

    final class Coordinator: NSObject {
        weak var scrollView: UIScrollView?
        private var observation: NSKeyValueObservation?
        private var attachedGeneration = -1
        let onOffsetChange: (CGFloat) -> Void

        init(onOffsetChange: @escaping (CGFloat) -> Void) {
            self.onOffsetChange = onOffsetChange
        }

        func scheduleAttach(from view: UIView, generation: Int) {
            DispatchQueue.main.async { [weak self, weak view] in
                guard let self, let view else { return }
                if self.attachedGeneration != generation {
                    self.detach()
                    self.attachedGeneration = generation
                }
                self.attach(from: view)
            }
        }

        private func attach(from view: UIView) {
            if observation != nil { return }

            if let scrollView = findScrollView(from: view) {
                bind(to: scrollView)
            }
        }

        private func findScrollView(from view: UIView) -> UIScrollView? {
            var ancestor: UIView? = view
            while let current = ancestor {
                if let scrollView = searchScrollView(in: current) {
                    return scrollView
                }
                ancestor = current.superview
            }
            return nil
        }

        private func searchScrollView(in view: UIView) -> UIScrollView? {
            if let tableView = view as? UITableView {
                return tableView
            }
            if let collectionView = view as? UICollectionView {
                return collectionView
            }
            if let scrollView = view as? UIScrollView {
                return scrollView
            }
            for subview in view.subviews {
                if let found = searchScrollView(in: subview) {
                    return found
                }
            }
            return nil
        }

        private func bind(to scrollView: UIScrollView) {
            self.scrollView = scrollView
            observation = scrollView.observe(
                \.contentOffset,
                options: [.new]
            ) { [weak self] scrollView, _ in
                self?.onOffsetChange(scrollView.contentOffset.y)
            }
            onOffsetChange(scrollView.contentOffset.y)
        }

        func detach() {
            observation?.invalidate()
            observation = nil
            scrollView = nil
        }

        deinit {
            detach()
        }
    }
}

struct CopilotScrollReporter: ViewModifier {
    @Environment(CopilotScrollContext.self) private var scrollContext

    func body(content: Content) -> some View {
        content.background(
            CopilotScrollTracker(trackingGeneration: scrollContext.trackingGeneration) { offset in
                scrollContext.reportScroll(offset: offset)
            }
        )
    }
}

extension View {
    func copilotScrollTracked() -> some View {
        modifier(CopilotScrollReporter())
    }

    /// Uses the expanded dock margin so List layout does not relayout when the dock collapses during scroll.
    func copilotDockScrollMargins(isExpanded _: Bool = true, hasTabAction: Bool = true) -> some View {
        contentMargins(
            .bottom,
            CopilotDockLayout.scrollContentMargin(isExpanded: true, hasTabAction: hasTabAction),
            for: .scrollContent
        )
    }
}
