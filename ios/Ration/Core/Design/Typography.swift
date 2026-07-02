import SwiftUI
import UIKit

/// Brand typography — Space Mono (Regular + Bold) with Dynamic Type scaling.
enum Typography {
    private static let regularName = "SpaceMono-Regular"
    private static let boldName = "SpaceMono-Bold"

    static func display() -> Font {
        scaledFont(name: boldName, size: 28, textStyle: .largeTitle, weight: .bold)
    }

    static func title() -> Font {
        scaledFont(name: boldName, size: 20, textStyle: .title2, weight: .bold)
    }

    static func headline() -> Font {
        scaledFont(name: boldName, size: 16, textStyle: .headline, weight: .semibold)
    }

    static func body() -> Font {
        scaledFont(name: regularName, size: 15, textStyle: .body, weight: .regular)
    }

    static func caption() -> Font {
        scaledFont(name: regularName, size: 12, textStyle: .caption1, weight: .regular)
    }

    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        let name = weight == .bold || weight == .semibold ? boldName : regularName
        return scaledFont(name: name, size: size, textStyle: .footnote, weight: weight)
    }

    static func dataCaption() -> Font {
        scaledFont(name: regularName, size: 12, textStyle: .caption1, weight: .regular)
            .monospacedDigit()
    }

    private static func scaledFont(
        name: String,
        size: CGFloat,
        textStyle: UIFont.TextStyle,
        weight: Font.Weight
    ) -> Font {
        let uiWeight: UIFont.Weight = switch weight {
        case .bold: .bold
        case .semibold: .semibold
        default: .regular
        }
        let base = UIFont(name: name, size: size)
            ?? UIFont.monospacedSystemFont(ofSize: size, weight: uiWeight)
        let scaled = UIFontMetrics(forTextStyle: textStyle).scaledFont(for: base)
        return Font(scaled)
    }
}

extension View {
    func rationDisplay() -> some View { font(Typography.display()).foregroundStyle(Theme.carbon) }
    func rationTitle() -> some View { font(Typography.title()).foregroundStyle(Theme.carbon) }
    func rationHeadline() -> some View { font(Typography.headline()).foregroundStyle(Theme.carbon) }
    func rationBody() -> some View { font(Typography.body()).foregroundStyle(Theme.carbon) }
    func rationCaption() -> some View { font(Typography.caption()).foregroundStyle(Theme.muted) }
}
