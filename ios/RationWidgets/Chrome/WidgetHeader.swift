import SwiftUI

struct WidgetHeader<Trailing: View>: View {
    let wordmark: String
    let source: String
    let destination: URL
    let palette: WidgetPalette
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 6) {
            Link(destination: destination) {
                HStack(spacing: 6) {
                    Text(wordmark)
                    Text("·")
                    Text(source)
                        .lineLimit(1)
                }
                .font(WidgetType.wordmark())
                .foregroundStyle(palette.muted)
            }
            Spacer(minLength: 0)
            trailing()
        }
    }
}

extension WidgetHeader where Trailing == EmptyView {
    init(wordmark: String, source: String, destination: URL, palette: WidgetPalette) {
        self.wordmark = wordmark
        self.source = source
        self.destination = destination
        self.palette = palette
        self.trailing = { EmptyView() }
    }
}
