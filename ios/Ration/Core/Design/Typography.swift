import SwiftUI
import UIKit

/// Brand typography — Space Mono (Regular + Bold) with Dynamic Type via `relativeTo`.
enum Typography {
    private static let regularName = "SpaceMono-Regular"
    private static let boldName = "SpaceMono-Bold"

    static func display() -> Font {
        custom(boldName, size: 28, relativeTo: .largeTitle)
    }

    static func title() -> Font {
        custom(boldName, size: 20, relativeTo: .title2)
    }

    static func headline() -> Font {
        custom(boldName, size: 16, relativeTo: .headline)
    }

    static func body() -> Font {
        custom(regularName, size: 15, relativeTo: .body)
    }

    static func caption() -> Font {
        custom(regularName, size: 12, relativeTo: .caption)
    }

    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        let name = weight == .bold || weight == .semibold ? boldName : regularName
        return custom(name, size: size, relativeTo: .footnote)
    }

    static func dataCaption() -> Font {
        custom(regularName, size: 12, relativeTo: .caption).monospacedDigit()
    }

    /// Falls back to system monospaced when custom fonts are unavailable (e.g. previews).
    private static func custom(_ name: String, size: CGFloat, relativeTo textStyle: Font.TextStyle) -> Font {
        if UIFont(name: name, size: size) != nil {
            return .custom(name, size: size, relativeTo: textStyle)
        }
        let weight: Font.Weight = name == boldName ? .bold : .regular
        return .system(size: size, weight: weight, design: .monospaced)
    }
}

extension View {
    func rationDisplay() -> some View { font(Typography.display()).foregroundStyle(Theme.carbon) }
    func rationTitle() -> some View { font(Typography.title()).foregroundStyle(Theme.carbon) }
    func rationHeadline() -> some View { font(Typography.headline()).foregroundStyle(Theme.carbon) }
    func rationBody() -> some View { font(Typography.body()).foregroundStyle(Theme.carbon) }
    func rationCaption() -> some View { font(Typography.caption()).foregroundStyle(Theme.muted) }
}
