import SwiftUI

struct WidgetStatusLine: View {
    let text: String?
    let palette: WidgetPalette

    var body: some View {
        if let text, !text.isEmpty {
            Text(text)
                .font(WidgetType.detail())
                .foregroundStyle(palette.muted)
                .lineLimit(1)
        }
    }
}

struct WidgetEmptyLine: View {
    let text: String
    let palette: WidgetPalette

    var body: some View {
        Text(text)
            .font(WidgetType.detail())
            .foregroundStyle(palette.muted)
            .lineLimit(2)
    }
}
