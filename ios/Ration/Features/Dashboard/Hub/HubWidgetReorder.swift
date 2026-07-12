import SwiftUI

enum HubWidgetReorder {
    static let coordinateSpaceName = "hubScroll"
}

struct HubWidgetFramePreferenceKey: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]

    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue()) { _, new in new }
    }
}

@MainActor
@Observable
final class HubWidgetReorderSession {
    var displayOrder: [HubWidgetLayout] = []
    var widgetFrames: [String: CGRect] = [:]
    private(set) var draggingId: String?
    private(set) var dragTranslation: CGFloat = 0
    private(set) var insertionTargetId: String?
    private var dragAnchorY: CGFloat = 0
    private var baselineOrder: [HubWidgetLayout] = []

    var isDragging: Bool { draggingId != nil }

    func syncDisplayOrder(from layout: [HubWidgetLayout]) {
        guard !isDragging else { return }
        displayOrder = layout
    }

    func beginDrag(id: String) {
        guard draggingId == nil else { return }
        draggingId = id
        dragTranslation = 0
        dragAnchorY = widgetFrames[id]?.midY ?? 0
        baselineOrder = displayOrder
        insertionTargetId = nil
        Haptics.medium()
    }

    func updateDrag(translation: CGFloat) {
        guard let draggingId else { return }
        dragTranslation = translation

        let fingerY = dragAnchorY + translation
        guard let destinationId = HubLayoutEngine.destinationId(
            forY: fingerY,
            frames: widgetFrames,
            order: displayOrder,
            excluding: draggingId
        ) else { return }

        guard destinationId != draggingId,
              displayOrder.firstIndex(where: { $0.id == destinationId }) !=
              displayOrder.firstIndex(where: { $0.id == draggingId })
        else {
            insertionTargetId = destinationId
            return
        }

        let sourceFrame = widgetFrames[draggingId]
        let destinationFrame = widgetFrames[destinationId]

        withAnimation(.interactiveSpring(response: 0.28, dampingFraction: 0.86)) {
            displayOrder = HubLayoutEngine.reorderDisplayOrder(
                displayOrder,
                moving: draggingId,
                to: destinationId
            )
            insertionTargetId = destinationId
        }

        if let sourceFrame, let destinationFrame {
            let delta = destinationFrame.midY - sourceFrame.midY
            dragAnchorY += delta
            dragTranslation -= delta
        }
    }

    /// Ends the drag session. Returns whether the order changed from the pre-drag baseline.
    func endDrag() -> Bool {
        let changed = displayOrder.map(\.id) != baselineOrder.map(\.id)
        if !changed {
            displayOrder = baselineOrder
        }
        draggingId = nil
        dragTranslation = 0
        insertionTargetId = nil
        dragAnchorY = 0
        baselineOrder = []
        if changed { Haptics.light() }
        return changed
    }

    func cancelDrag() {
        if isDragging {
            displayOrder = baselineOrder
        }
        draggingId = nil
        dragTranslation = 0
        insertionTargetId = nil
        dragAnchorY = 0
        baselineOrder = []
    }

    func placeholderHeight(for id: String) -> CGFloat {
        max(widgetFrames[id]?.height ?? 0, 72)
    }
}

struct HubWidgetReorderRowModifier: ViewModifier {
    let widgetId: String
    var session: HubWidgetReorderSession
    let onOrderChanged: () -> Void

    func body(content: Content) -> some View {
        VStack(spacing: 0) {
            if session.insertionTargetId == widgetId, session.draggingId != widgetId {
                Capsule()
                    .fill(Theme.hyperGreen)
                    .frame(height: 2)
                    .padding(.bottom, 8)
                    .transition(.opacity)
            }

            ZStack {
                if session.draggingId == widgetId {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(
                            Theme.platinum.opacity(0.85),
                            style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])
                        )
                        .frame(height: session.placeholderHeight(for: widgetId))
                        .opacity(0.45)
                }

                content
                    .background(
                        GeometryReader { geometry in
                            Color.clear.preference(
                                key: HubWidgetFramePreferenceKey.self,
                                value: [widgetId: geometry.frame(in: .named(HubWidgetReorder.coordinateSpaceName))]
                            )
                        }
                    )
                    .scaleEffect(session.draggingId == widgetId ? 1.02 : 1)
                    .shadow(
                        color: session.draggingId == widgetId ? Theme.carbon.opacity(0.12) : .clear,
                        radius: 12,
                        y: 6
                    )
                    .offset(y: session.draggingId == widgetId ? session.dragTranslation : 0)
                    .zIndex(session.draggingId == widgetId ? 1 : 0)
            }
        }
        .simultaneousGesture(reorderGesture)
        .accessibilityHint("Long press to reorder")
        .accessibilityAddTraits(session.draggingId == widgetId ? .isSelected : [])
    }

    private var reorderGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.4)
            .sequenced(
                before: DragGesture(minimumDistance: 0, coordinateSpace: .named(HubWidgetReorder.coordinateSpaceName))
            )
            .onChanged { value in
                switch value {
                case .second(true, let drag):
                    if !session.isDragging {
                        session.beginDrag(id: widgetId)
                    }
                    if let drag {
                        session.updateDrag(translation: drag.translation.height)
                    }
                default:
                    break
                }
            }
            .onEnded { value in
                switch value {
                case .second(true, _):
                    if session.endDrag() {
                        onOrderChanged()
                    }
                default:
                    session.cancelDrag()
                }
            }
    }
}

extension View {
    func hubWidgetReorderRow(
        id: String,
        session: HubWidgetReorderSession,
        onOrderChanged: @escaping () -> Void
    ) -> some View {
        modifier(HubWidgetReorderRowModifier(
            widgetId: id,
            session: session,
            onOrderChanged: onOrderChanged
        ))
    }
}
