import SwiftUI
import UIKit

/// Ration "Orbital Luxury" palette — mirrors `app/app.css` web tokens.
/// Theme-aware colors resolve light/dark via `Color(UIColor { traits in ... })`.
enum Theme {
    // Accent colors — identical in both themes.
    static let hyperGreen = Color(hex: 0x00E088)
    static let success = Color(hex: 0x10B981)
    static let warning = Color(hex: 0xF59E0B)
    static let danger = Color(hex: 0xEF4444)

    /// Ceramic — primary background.
    static let ceramic = adaptive(light: 0xF8F9FA, dark: 0x0D0D0D)
    /// Platinum — secondary background / cards.
    static let platinum = adaptive(light: 0xE6E6E6, dark: 0x1A1A1A)
    /// Carbon — primary text.
    static let carbon = adaptive(light: 0x111111, dark: 0xF8F9FA)
    /// Muted text.
    static let muted = adaptive(light: 0x6B7280, dark: 0x9CA3AF)
    /// Surface — frosted panels.
    static let surface = adaptive(light: 0xFFFFFF, dark: 0x1A1A1A)

    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(Color(hex: dark))
                : UIColor(Color(hex: light))
        })
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}
