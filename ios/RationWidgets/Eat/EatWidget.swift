import AppIntents
import SwiftUI
import WidgetKit

struct AteHomeWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: "com.mayutic.ration.ate",
            intent: EatWidgetConfiguration.self,
            provider: EatWidgetProvider()
        ) { entry in
            EatWidgetView(entry: entry)
                .rationWidgetChrome(appearance: entry.appearance)
        }
        .configurationDisplayName("Eat")
        .description("Take one piece from Cargo. Grams open Ration so you can choose an amount.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct EatWidgetProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> RationWidgetEntry {
        RationWidgetEntry(date: Date(), cache: .placeholder, appearance: .system, eatTagSlug: nil, eatTagName: nil)
    }

    func snapshot(for configuration: EatWidgetConfiguration, in context: Context) async -> RationWidgetEntry {
        RationWidgetEntry(
            date: Date(),
            cache: .placeholder,
            appearance: configuration.appearance,
            eatTagSlug: configuration.tag?.id,
            eatTagName: configuration.tag?.name
        )
    }

    func timeline(for configuration: EatWidgetConfiguration, in context: Context) async -> Timeline<RationWidgetEntry> {
        let slug = configuration.tag?.id
        let cache = await WidgetSnapshotLoader.load(force: false, tag: slug)
        return WidgetTimelines.make(
            cache: cache,
            appearance: configuration.appearance,
            eatTagSlug: slug,
            eatTagName: configuration.tag?.name
        )
    }
}

struct EatWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var systemScheme
    @Environment(\.widgetRenderingMode) private var renderingMode
    let entry: RationWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(wordmark: "EAT", source: sourceWord, destination: cargoURL, palette: palette)
            WidgetStatusLine(text: entry.cache.statusLine, palette: palette)
            if entry.cache.isReady {
                content
            } else {
                WidgetEmptyLine(text: HomeWidgetCopy.calmLine(for: entry.cache.state), palette: palette)
            }
            if family == .systemLarge {
                Spacer(minLength: 8)
                Text(sourceLine)
                    .font(WidgetType.detail())
                    .foregroundStyle(palette.muted)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(cargoURL)
    }

    private var palette: WidgetPalette {
        WidgetPalette.resolve(appearance: entry.appearance, system: systemScheme, rendering: renderingMode)
    }

    private var sourceWord: String { entry.eatTagName ?? "Cargo" }

    private var sourceLine: String {
        if let name = entry.eatTagName { return HomeWidgetCopy.taggedSource(name: name) }
        return "Recent Cargo"
    }

    private var cargoURL: URL { WidgetLinks.cargo(tag: entry.eatTagSlug) }

    private var interactive: Bool { family == .systemMedium || family == .systemLarge }

    private var rowLimit: Int {
        switch family {
        case .systemLarge: return 4
        case .systemMedium: return 2
        default: return 1
        }
    }

    @ViewBuilder
    private var content: some View {
        if tagIsGone {
            WidgetEmptyLine(text: "That tag is gone", palette: palette)
        } else if let ate {
            if !ate.available {
                WidgetEmptyLine(text: "Open Cargo to eat", palette: palette)
            } else if ate.foods.isEmpty {
                WidgetEmptyLine(
                    text: entry.eatTagName.map { HomeWidgetCopy.taggedEmpty(name: $0) } ?? "Nothing ready to eat",
                    palette: palette
                )
            } else if interactive {
                ForEach(foods.prefix(rowLimit)) { food in
                    row(food)
                }
            } else {
                if let food = foods.first {
                    glance(food)
                }
                if foods.count > 1 {
                    WidgetEmptyLine(text: "Open Cargo", palette: palette)
                }
            }
        } else {
            WidgetEmptyLine(text: HomeWidgetCopy.calmLine(for: entry.cache.state), palette: palette)
        }
    }

    private func glance(_ food: HomeWidgetAteFood) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(food.name)
                .font(WidgetType.title())
                .foregroundStyle(palette.carbon)
                .lineLimit(1)
            Text(detail(for: food))
                .font(WidgetType.detail())
                .foregroundStyle(palette.muted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
    }

    @ViewBuilder
    private func row(_ food: HomeWidgetAteFood) -> some View {
        let saving = entry.cache.inFlightCargoIds.contains(food.cargoId) && !isEaten(food.cargoId)
        if food.eatsOneStep {
            Button(intent: EatCargoStepIntent(food: food)) {
                WidgetActionRow(
                    systemImage: "fork.knife",
                    title: food.name,
                    detail: detail(for: food),
                    succeeded: isEaten(food.cargoId),
                    succeededWord: "Eaten",
                    saving: saving,
                    palette: palette
                )
            }
            .buttonStyle(.plain)
            .disabled(saving || isEaten(food.cargoId))
            .accessibilityLabel(accessibility(for: food))
        } else if let url = WidgetLinks.cargoEat(id: food.cargoId) {
            Link(destination: url) {
                WidgetActionRow(
                    systemImage: "arrow.up.right",
                    title: food.name,
                    detail: "Choose amount",
                    succeeded: false,
                    succeededWord: "",
                    saving: false,
                    palette: palette
                )
            }
            .accessibilityLabel("Choose an amount of \(food.name)")
        }
    }

    private func detail(for food: HomeWidgetAteFood) -> String {
        if let hold = entry.cache.eatHold, hold.id == food.cargoId, hold.isActive(at: entry.date), let quantity = hold.quantity, let unit = hold.unit {
            return HomeWidgetCopy.eatDetail(quantity: quantity, unit: unit, step: food.stepQuantity)
        }
        return HomeWidgetCopy.eatDetail(quantity: food.quantity, unit: food.unit, step: food.stepQuantity)
    }

    private func accessibility(for food: HomeWidgetAteFood) -> String {
        if isEaten(food.cargoId) { return "Ate one \(food.unit) of \(food.name)" }
        return "Eat one \(food.unit) of \(food.name)"
    }

    private func isEaten(_ id: String) -> Bool {
        guard let hold = entry.cache.eatHold else { return false }
        return hold.id == id && hold.isActive(at: entry.date)
    }

    private var ate: HomeWidgetSnapshot.Ate? {
        guard entry.cache.isReady else { return nil }
        if let slug = entry.eatTagSlug {
            return entry.cache.ateByTag[slug]
        }
        return entry.cache.snapshot?.ate
    }

    private var foods: [HomeWidgetAteFood] { ate?.foods ?? [] }

    private var tagIsGone: Bool {
        guard let slug = entry.eatTagSlug, entry.cache.isReady else { return false }
        let choices = entry.cache.snapshot?.ate.tagChoices ?? []
        guard !choices.isEmpty else { return false }
        let listed = choices.contains { $0.slug == slug }
        return !listed && foods.isEmpty
    }
}
