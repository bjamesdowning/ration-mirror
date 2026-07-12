import SwiftUI
import Observation
import UIKit

@MainActor
@Observable
final class CopilotScrollContext {
    private(set) var isExpanded = true
    private(set) var scrollDirection: CopilotScrollDirection = .idle
    private(set) var trackingGeneration = 0
    private(set) var activeTab = 0
    private(set) var keyboardInset: CGFloat = 0
    private(set) var keyboardDismissDragProgress: CGFloat = 0
    private(set) var composerHeight = CopilotDockLayout.expandedInputBarHeight
    private(set) var keyboardAnimationDuration: Double = 0.25
    private(set) var keyboardAnimationCurve: UIView.AnimationCurve = .easeInOut
    private(set) var isComposerFocused = false

    private var canAutoExpand = true
    private var lastOffset: CGFloat = 0
    private var lastProcessedAt: CFAbsoluteTime = 0
    private var dismissKeyboardHandler: (() -> Void)?
    private let scrollProcessInterval: CFAbsoluteTime = 0.05

    var effectiveKeyboardInset: CGFloat {
        keyboardInset * (1 - keyboardDismissDragProgress)
    }

    func setKeyboardDismissDragProgress(_ progress: CGFloat) {
        let clamped = min(1, max(0, progress))
        guard keyboardDismissDragProgress != clamped else { return }
        keyboardDismissDragProgress = clamped
    }

    func setActiveTab(_ tab: Int) {
        activeTab = tab
    }

    func shouldAcceptScrollReports(from tab: Int, isTabActive: Bool) -> Bool {
        isTabActive && tab == activeTab
    }

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
        dismissKeyboard()
        trackingGeneration += 1
        lastOffset = 0
        lastProcessedAt = 0
        scrollDirection = .idle
        keyboardInset = 0
        keyboardDismissDragProgress = 0
        isExpanded = canAutoExpand
    }

    func setKeyboardInset(
        _ inset: CGFloat,
        duration: Double? = nil,
        curve: UIView.AnimationCurve? = nil
    ) {
        let clamped = max(0, inset)
        if let duration {
            keyboardAnimationDuration = duration
        }
        if let curve {
            keyboardAnimationCurve = curve
        }
        guard keyboardInset != clamped else { return }
        keyboardInset = clamped
        if clamped == 0 {
            keyboardDismissDragProgress = 0
        }
    }

    func setComposerHeight(_ height: CGFloat) {
        composerHeight = max(CopilotDockLayout.expandedInputBarHeight, height)
    }

    var keyboardAnimation: Animation {
        switch keyboardAnimationCurve {
        case .easeIn:
            return .easeIn(duration: keyboardAnimationDuration)
        case .easeOut:
            return .easeOut(duration: keyboardAnimationDuration)
        case .linear:
            return .linear(duration: keyboardAnimationDuration)
        case .easeInOut:
            return .easeInOut(duration: keyboardAnimationDuration)
        @unknown default:
            return .easeInOut(duration: keyboardAnimationDuration)
        }
    }

    func registerDismissKeyboardHandler(_ handler: (() -> Void)?) {
        dismissKeyboardHandler = handler
    }

    func setComposerFocused(_ focused: Bool) {
        isComposerFocused = focused
    }

    func dismissKeyboard() {
        dismissKeyboardHandler?()
        isComposerFocused = false
        keyboardDismissDragProgress = 0
    }

    func expandManually() {
        withAnimation(MotionPolicy.prefersReducedMotion ? nil : MotionPolicy.dockSpring) {
            isExpanded = true
        }
    }

    func collapse() {
        dismissKeyboard()
        withAnimation(MotionPolicy.prefersReducedMotion ? nil : MotionPolicy.dockSpring) {
            isExpanded = false
        }
    }

    func reportScroll(offset: CGFloat, isInitial: Bool = false) {
        if isInitial {
            lastOffset = offset
            lastProcessedAt = CFAbsoluteTimeGetCurrent()
            return
        }
        let now = CFAbsoluteTimeGetCurrent()
        let delta = offset - lastOffset
        guard let direction = CopilotScrollCollapsePolicy.direction(delta: delta) else {
            return
        }

        lastOffset = offset

        let isCollapsing = CopilotScrollCollapsePolicy.shouldCollapse(
            normalizedOffset: offset,
            direction: direction,
            isExpanded: isExpanded,
            isComposerFocused: isComposerFocused
        )
        let isExpanding = CopilotScrollCollapsePolicy.shouldExpand(
            direction: direction,
            isExpanded: isExpanded,
            canAutoExpand: canAutoExpand,
            isComposerFocused: isComposerFocused
        )
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
    let tab: Int
    let isTabActive: Bool
    let scrollContext: CopilotScrollContext
    let trackingGeneration: Int
    let isEnabled: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        context.coordinator.tab = tab
        context.coordinator.isTabActive = isTabActive
        context.coordinator.scrollContext = scrollContext
        context.coordinator.updateEnabled(isEnabled, from: view, generation: trackingGeneration)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.tab = tab
        context.coordinator.isTabActive = isTabActive
        context.coordinator.scrollContext = scrollContext
        context.coordinator.updateEnabled(isEnabled, from: uiView, generation: trackingGeneration)
    }

    final class Coordinator: NSObject {
        weak var scrollView: UIScrollView?
        private var observation: NSKeyValueObservation?
        private var attachedGeneration = -1
        private var isEnabled = false
        var tab = 0
        var isTabActive = false
        weak var scrollContext: CopilotScrollContext?

        func updateEnabled(_ enabled: Bool, from view: UIView, generation: Int) {
            isEnabled = enabled
            DispatchQueue.main.async { [weak self, weak view] in
                guard let self, let view else { return }
                if !self.isEnabled {
                    self.detach()
                    self.attachedGeneration = -1
                    return
                }
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
                guard scrollView.isTracking || scrollView.isDragging || scrollView.isDecelerating else {
                    return
                }
                let normalized = CopilotScrollCollapsePolicy.normalizedOffset(
                    contentOffsetY: scrollView.contentOffset.y,
                    adjustedTopInset: scrollView.adjustedContentInset.top
                )
                self?.reportOffset(normalized, isInitial: false)
            }
            let normalized = CopilotScrollCollapsePolicy.normalizedOffset(
                contentOffsetY: scrollView.contentOffset.y,
                adjustedTopInset: scrollView.adjustedContentInset.top
            )
            reportOffset(normalized, isInitial: true)
        }

        private func reportOffset(_ offset: CGFloat, isInitial: Bool) {
            let tab = self.tab
            let isTabActive = self.isTabActive
            guard let scrollContext = self.scrollContext else { return }
            Task { @MainActor in
                guard scrollContext.shouldAcceptScrollReports(from: tab, isTabActive: isTabActive) else {
                    return
                }
                scrollContext.reportScroll(offset: offset, isInitial: isInitial)
            }
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
    let tab: Int
    let isActive: Bool
    @Environment(CopilotScrollContext.self) private var scrollContext

    private var isTrackingEnabled: Bool {
        scrollContext.shouldAcceptScrollReports(from: tab, isTabActive: isActive)
    }

    func body(content: Content) -> some View {
        content.background(
            CopilotScrollTracker(
                tab: tab,
                isTabActive: isActive,
                scrollContext: scrollContext,
                trackingGeneration: scrollContext.trackingGeneration,
                isEnabled: isTrackingEnabled
            )
        )
    }
}

private struct CopilotKeyboardDismissOverlay: ViewModifier {
    let scrollContext: CopilotScrollContext
    let hasTabAction: Bool

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if scrollContext.keyboardInset > 0 {
                Color.black.opacity(0.001)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        scrollContext.dismissKeyboard()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(.bottom, dismissOverlayReservedBottom)
            }
        }
    }

    /// Leave the dock + tab bar region tappable while the keyboard is open.
    private var dismissOverlayReservedBottom: CGFloat {
        let base = max(CopilotDockLayout.tabBarClearance, scrollContext.effectiveKeyboardInset)
            + CopilotDockLayout.dockHeight(
                isExpanded: scrollContext.isExpanded,
                hasTabAction: hasTabAction
            )
        return base + expandedComposerHeightAdjustment
    }

    private var expandedComposerHeightAdjustment: CGFloat {
        guard scrollContext.isExpanded else { return 0 }
        return max(
            0,
            scrollContext.composerHeight - CopilotDockLayout.expandedInputBarHeight
        )
    }
}

private struct CopilotDockScrollMarginsModifier: ViewModifier {
    @Environment(CopilotScrollContext.self) private var scrollContext
    let hasTabAction: Bool

    private var margin: CGFloat {
        let base = CopilotDockLayout.scrollContentMargin(
            isExpanded: scrollContext.isExpanded,
            hasTabAction: hasTabAction,
            keyboardInset: scrollContext.effectiveKeyboardInset
        )
        guard scrollContext.isExpanded else { return base }
        return base + max(
            0,
            scrollContext.composerHeight - CopilotDockLayout.expandedInputBarHeight
        )
    }

    func body(content: Content) -> some View {
        content
            .contentMargins(.bottom, margin, for: .scrollContent)
    }
}

enum CopilotKeyboardGeometry {
    static func bottomInset(keyboardFrame: CGRect, windowBounds: CGRect) -> CGFloat {
        guard keyboardFrame.minY < windowBounds.maxY,
              keyboardFrame.maxY >= windowBounds.maxY - 1 else {
            return 0
        }
        let intersection = windowBounds.intersection(keyboardFrame)
        guard !intersection.isNull else { return 0 }
        return max(0, intersection.height)
    }
}

private struct CopilotKeyboardInsetObserver: ViewModifier {
    let scrollContext: CopilotScrollContext

    func body(content: Content) -> some View {
        content
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { notification in
                guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else {
                    return
                }
                let overlap: CGFloat
                if let window = activeWindow {
                    let frameInWindow = window.convert(frame, from: window.screen.coordinateSpace)
                    overlap = CopilotKeyboardGeometry.bottomInset(
                        keyboardFrame: frameInWindow,
                        windowBounds: window.bounds
                    )
                } else {
                    overlap = 0
                }
                let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double
                let curveRaw = notification.userInfo?[UIResponder.keyboardAnimationCurveUserInfoKey] as? Int
                let curve = curveRaw.flatMap(UIView.AnimationCurve.init(rawValue:))
                scrollContext.setKeyboardInset(overlap, duration: duration, curve: curve)
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                scrollContext.setKeyboardInset(0)
            }
    }

    private var activeWindow: UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
    }
}

extension View {
    func copilotScrollTracked(tab: Int, isActive: Bool) -> some View {
        modifier(CopilotScrollReporter(tab: tab, isActive: isActive))
    }

    func copilotKeyboardDismissOverlay(
        _ scrollContext: CopilotScrollContext,
        hasTabAction: Bool = true
    ) -> some View {
        modifier(
            CopilotKeyboardDismissOverlay(
                scrollContext: scrollContext,
                hasTabAction: hasTabAction
            )
        )
    }

    func copilotKeyboardObserved(_ scrollContext: CopilotScrollContext) -> some View {
        modifier(CopilotKeyboardInsetObserver(scrollContext: scrollContext))
    }

    /// Reserves bottom scroll margin for the dock; uses collapsed height when the bar is minimized.
    func copilotDockScrollMargins(hasTabAction: Bool = true) -> some View {
        modifier(CopilotDockScrollMarginsModifier(hasTabAction: hasTabAction))
    }
}
