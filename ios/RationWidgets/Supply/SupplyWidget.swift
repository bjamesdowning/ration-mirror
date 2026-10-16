import AppIntents
import SwiftUI
import WidgetKit

struct SupplyHomeWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: "com.mayutic.ration.supply",
            intent: WidgetAppearanceIntent.self,
            provider: SupplyWidgetProvider()
        ) { entry in
            SupplyWidgetView(entry: entry)
                .rationWidgetChrome(appearance: entry.appearance)
        }
        .configurationDisplayName("Supply")
        .description("Unchecked items on your Live list. Check them off without docking into Cargo.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}

struct SupplyWidgetProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> RationWidgetEntry {
        RationWidgetEntry(date: Date(), cache: .placeholder, appearance: .system, eatTagSlug: nil, eatTagName: nil)
    }

    func snapshot(for configuration: WidgetAppearanceIntent, in context: Context) async -> RationWidgetEntry {
        RationWidgetEntry(date: Date(), cache: .placeholder, appearance: configuration.appearance, eatTagSlug: nil, eatTagName: nil)
    }

    func timeline(for configuration: WidgetAppearanceIntent, in context: Context) async -> Timeline<RationWidgetEntry> {
        let cache = await WidgetSnapshotLoader.load(force: false, tag: nil)
        return WidgetTimelines.make(cache: cache, appearance: configuration.appearance, eatTagSlug: nil, eatTagName: nil)
    }
}

struct SupplyWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var systemScheme
    @Environment(\.widgetRenderingMode) private var renderingMode
    let entry: RationWidgetEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            Text(inlineText)
        case .accessoryCircular:
            Text(circularText)
                .font(.headline.monospacedDigit())
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text(HomeWidgetCopy.supplyHeadline(uncheckedCount: count))
                    .font(.caption.weight(.semibold))
                Text(lockScreenNames)
                    .font(.caption2)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .widgetURL(WidgetLinks.supply)
        case .systemSmall:
            small
        case .systemLarge:
            list(limit: 5)
        default:
            list(limit: 2)
        }
    }

    private var palette: WidgetPalette {
        WidgetPalette.resolve(appearance: entry.appearance, system: systemScheme, rendering: renderingMode)
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            Text(countText)
                .font(WidgetType.count())
                .foregroundStyle(palette.carbon)
                .contentTransition(.numericText())
            Text(statusOrHeadline)
                .font(WidgetType.detail())
                .foregroundStyle(palette.muted)
                .lineLimit(1)
            if let name = firstName {
                Text(name)
                    .font(WidgetType.title())
                    .foregroundStyle(palette.carbon)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(WidgetLinks.supply)
    }

    private func list(limit: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            WidgetStatusLine(text: entry.cache.statusLine, palette: palette)
            if entry.cache.isReady {
                let rows = displayItems.prefix(limit)
                if rows.isEmpty {
                    WidgetEmptyLine(text: "Nothing to buy", palette: palette)
                } else {
                    ForEach(Array(rows)) { item in
                        Button(intent: MarkSupplyPurchasedIntent(itemId: item.id)) {
                            WidgetActionRow(
                                systemImage: "circle",
                                title: item.name,
                                detail: nil,
                                succeeded: isBought(item.id),
                                succeededWord: "Bought",
                                saving: false,
                                palette: palette
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(isBought(item.id))
                        .accessibilityLabel(isBought(item.id) ? "\(item.name) bought" : "Mark \(item.name) purchased")
                    }
                }
            } else {
                WidgetEmptyLine(text: HomeWidgetCopy.calmLine(for: entry.cache.state), palette: palette)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(WidgetLinks.supply)
    }

    private var header: some View {
        WidgetHeader(wordmark: "SUPPLY", source: "Live", destination: WidgetLinks.supply, palette: palette) {
            if entry.cache.isReady, family != .accessoryInline && family != .accessoryCircular && family != .accessoryRectangular {
                Link(destination: WidgetLinks.supplyCompose) {
                    Image(systemName: "plus")
                        .font(.body.weight(.bold))
                        .foregroundStyle(palette.hyperGreen)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Add items")
            }
        }
    }

    private var displayItems: [HomeWidgetSupplyItem] {
        var items = entry.cache.snapshot?.supply.items ?? []
        guard let hold = entry.cache.supplyHold, hold.isActive(at: entry.date) else {
            if let hold = entry.cache.supplyHold {
                items.removeAll { $0.id == hold.id }
            }
            return items
        }
        if !items.contains(where: { $0.id == hold.id }) {
            items.insert(HomeWidgetSupplyItem(id: hold.id, name: hold.name), at: 0)
        }
        return items
    }

    private func isBought(_ id: String) -> Bool {
        guard let hold = entry.cache.supplyHold else { return false }
        return hold.id == id && hold.isActive(at: entry.date)
    }

    private var count: Int { entry.cache.snapshot?.supply.uncheckedCount ?? 0 }

    private var countText: String {
        guard entry.cache.isReady else { return "—" }
        return "\(count)"
    }

    private var firstName: String? {
        guard entry.cache.isReady else { return nil }
        return entry.cache.snapshot?.supply.items.first?.name
    }

    private var inlineText: String {
        guard entry.cache.isReady else { return "Supply" }
        return HomeWidgetCopy.supplyHeadline(uncheckedCount: count)
    }

    private var circularText: String {
        guard entry.cache.isReady else { return "–" }
        return "\(count)"
    }

    private var lockScreenNames: String {
        guard entry.cache.isReady else { return HomeWidgetCopy.calmLine(for: entry.cache.state) }
        let names = entry.cache.snapshot?.supply.items.prefix(2).map(\.name) ?? []
        return names.isEmpty ? "Nothing to buy" : names.joined(separator: ", ")
    }

    private var statusOrHeadline: String {
        if let line = entry.cache.statusLine { return line }
        guard entry.cache.isReady else { return HomeWidgetCopy.calmLine(for: entry.cache.state) }
        return HomeWidgetCopy.supplyHeadline(uncheckedCount: count)
    }
}
