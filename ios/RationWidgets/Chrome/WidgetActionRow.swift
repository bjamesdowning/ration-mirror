import SwiftUI
import WidgetKit

struct WidgetActionRow: View {
    let systemImage: String
    let title: String
    let detail: String?
    let succeeded: Bool
    let succeededWord: String
    let saving: Bool
    let palette: WidgetPalette

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: succeeded ? "checkmark.circle.fill" : systemImage)
                .font(.body)
                .foregroundStyle(palette.hyperGreen)
                .widgetAccentable()
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(WidgetType.title())
                    .foregroundStyle(succeeded ? palette.muted : palette.carbon)
                    .strikethrough(succeeded)
                    .lineLimit(1)
                if let line = statusDetail {
                    Text(line)
                        .font(WidgetType.detail())
                        .foregroundStyle(palette.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if succeeded {
                Text(succeededWord)
                    .font(WidgetType.detail())
                    .foregroundStyle(palette.muted)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var statusDetail: String? {
        if saving { return "Saving…" }
        return detail
    }
}
