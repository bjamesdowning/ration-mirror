import SwiftUI

/// Ration uses Space Mono on web. To avoid bundling font binaries in the repo,
/// the app falls back to the system monospaced design, which reads as the same
/// precision-instrument aesthetic. To ship pixel-exact brand type, add the
/// SpaceMono TTFs to the target, register them in Info.plist (UIAppFonts), and
/// swap `.system(..., design: .monospaced)` for `.custom("SpaceMono-Regular", ...)`.
enum Typography {
    static func display() -> Font { .system(size: 28, weight: .bold, design: .monospaced) }
    static func title() -> Font { .system(size: 20, weight: .bold, design: .monospaced) }
    static func headline() -> Font { .system(size: 16, weight: .semibold, design: .monospaced) }
    static func body() -> Font { .system(size: 15, weight: .regular, design: .monospaced) }
    static func caption() -> Font { .system(size: 12, weight: .regular, design: .monospaced) }
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

extension View {
    func rationDisplay() -> some View { font(Typography.display()).foregroundStyle(Theme.carbon) }
    func rationTitle() -> some View { font(Typography.title()).foregroundStyle(Theme.carbon) }
    func rationHeadline() -> some View { font(Typography.headline()).foregroundStyle(Theme.carbon) }
    func rationBody() -> some View { font(Typography.body()).foregroundStyle(Theme.carbon) }
    func rationCaption() -> some View { font(Typography.caption()).foregroundStyle(Theme.muted) }
}
