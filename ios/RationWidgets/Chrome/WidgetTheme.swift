import SwiftUI
import UIKit
import WidgetKit

struct WidgetPalette {
    var ceramic: Color
    var carbon: Color
    var muted: Color
    var platinum: Color
    var hyperGreen: Color
    var warning: Color

    static let hyperGreen = Color(hex: 0x00E088)
    static let warning = Color(hex: 0xF59E0B)

    static func resolve(
        appearance: WidgetAppearance,
        system: ColorScheme,
        rendering: WidgetRenderingMode
    ) -> WidgetPalette {
        let scheme = appearance.resolved(system: system)
        if rendering != .fullColor {
            return WidgetPalette(
                ceramic: .clear,
                carbon: .primary,
                muted: .secondary,
                platinum: Color.primary.opacity(0.15),
                hyperGreen: .primary,
                warning: .primary
            )
        }
        let dark = scheme == .dark
        return WidgetPalette(
            ceramic: Color(hex: dark ? 0x0D0D0D : 0xF8F9FA),
            carbon: Color(hex: dark ? 0xF8F9FA : 0x111111),
            muted: Color(hex: dark ? 0x9CA3AF : 0x6B7280),
            platinum: Color(hex: dark ? 0x1A1A1A : 0xE6E6E6),
            hyperGreen: hyperGreen,
            warning: warning
        )
    }
}

enum WidgetType {
    static func wordmark() -> Font { mono(12, bold: true) }
    static func title() -> Font { mono(15, bold: false) }
    static func detail() -> Font { mono(12, bold: false) }
    static func count() -> Font { mono(28, bold: true) }

    private static func mono(_ size: CGFloat, bold: Bool) -> Font {
        let name = bold ? "SpaceMono-Bold" : "SpaceMono-Regular"
        if UIFont(name: name, size: size) != nil {
            return .custom(name, size: size)
        }
        return .system(size: size, weight: bold ? .bold : .regular, design: .monospaced)
    }
}

extension Color {
    init(hex: UInt32) {
        let red = Double((hex >> 16) & 0xFF) / 255
        let green = Double((hex >> 8) & 0xFF) / 255
        let blue = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: red, green: green, blue: blue)
    }
}

extension View {
    @ViewBuilder
    func rationWidgetChrome(appearance: WidgetAppearance) -> some View {
        modifier(WidgetChromeModifier(appearance: appearance))
    }
}

private struct WidgetChromeModifier: ViewModifier {
    @Environment(\.colorScheme) private var systemScheme
    @Environment(\.widgetRenderingMode) private var renderingMode
    let appearance: WidgetAppearance

    func body(content: Content) -> some View {
        let scheme = appearance.resolved(system: systemScheme)
        let palette = WidgetPalette.resolve(
            appearance: appearance,
            system: systemScheme,
            rendering: renderingMode
        )
        content
            .environment(\.colorScheme, renderingMode == .fullColor ? scheme : systemScheme)
            .containerBackground(for: .widget) {
                palette.ceramic
            }
    }
}

enum WidgetLinks {
    static func cargo(tag: String?) -> URL {
        var components = URLComponents()
        components.scheme = "ration"
        components.host = "cargo"
        if let tag, !tag.isEmpty {
            components.queryItems = [URLQueryItem(name: "tags", value: tag)]
        }
        return components.url ?? URL(string: "ration://cargo")!
    }

    static func cargoEat(id: String) -> URL? {
        URL(string: "ration://cargo/eat?id=\(id)")
    }

    static let supply = URL(string: "ration://supply")!
    static let supplyCompose = URL(string: "ration://supply?compose=1")!
    static let today = URL(string: "ration://manifest/today")!
}

enum WidgetSlot {
    static func systemImage(for slotType: String) -> String {
        switch slotType.lowercased() {
        case "breakfast": return "sunrise.fill"
        case "lunch": return "sun.max.fill"
        case "dinner": return "moon.fill"
        case "snack": return "carrot.fill"
        default: return "fork.knife"
        }
    }
}
