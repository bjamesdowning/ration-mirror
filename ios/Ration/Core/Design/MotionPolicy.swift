import SwiftUI
import UIKit

/// Restrained motion tokens with Reduce Motion fallbacks.
enum MotionPolicy {
    static var prefersReducedMotion: Bool {
        UIAccessibility.isReduceMotionEnabled
    }

    static var dockSpring: Animation {
        prefersReducedMotion
            ? .easeOut(duration: 0.15)
            : .spring(response: 0.32, dampingFraction: 0.86)
    }

    static var shortFade: Animation {
        prefersReducedMotion ? .linear(duration: 0.01) : .easeOut(duration: 0.2)
    }

    static func repeatingPulse(duration: Double) -> Animation? {
        prefersReducedMotion ? nil : .easeInOut(duration: duration).repeatForever(autoreverses: true)
    }
}
