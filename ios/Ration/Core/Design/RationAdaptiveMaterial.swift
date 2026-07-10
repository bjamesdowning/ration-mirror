import SwiftUI

/// Frosted surfaces that fall back to opaque `Theme.surface` when Reduce Transparency is on.
struct RationAdaptiveMaterial: View {
    var shape: AnyShape = AnyShape(Capsule())

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        Group {
            if reduceTransparency {
                Theme.surface
            } else {
                Rectangle().fill(.ultraThinMaterial)
            }
        }
        .clipShape(shape)
    }
}

extension View {
    func rationAdaptiveMaterial<S: Shape>(in shape: S) -> some View {
        background(RationAdaptiveMaterial(shape: AnyShape(shape)))
    }
}

struct AnyShape: Shape, @unchecked Sendable {
    private let pathBuilder: @Sendable (CGRect) -> Path

    init<S: Shape>(_ shape: S) {
        pathBuilder = { rect in
            shape.path(in: rect)
        }
    }

    func path(in rect: CGRect) -> Path {
        pathBuilder(rect)
    }
}
