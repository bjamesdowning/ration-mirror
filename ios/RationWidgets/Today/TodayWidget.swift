import AppIntents
import SwiftUI
import WidgetKit

struct TodayHomeWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: "com.mayutic.ration.today",
            intent: WidgetAppearanceIntent.self,
            provider: TodayWidgetProvider()
        ) { entry in
            TodayWidgetView(entry: entry)
                .rationWidgetChrome(appearance: entry.appearance)
        }
        .configurationDisplayName("Today")
        .description("Today's meals by breakfast, lunch, snack, and dinner. Large adds remaining calories and macros.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct TodayWidgetProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> RationWidgetEntry {
        RationWidgetEntry(date: Date(), cache: .placeholder, appearance: .system, eatTagSlug: nil, eatTagName: nil)
    }

    func snapshot(for configuration: WidgetAppearanceIntent, in context: Context) async -> RationWidgetEntry {
        RationWidgetEntry(
            date: Date(),
            cache: WidgetSnapshotLoader.snapshotCache(isPreview: context.isPreview),
            appearance: configuration.appearance,
            eatTagSlug: nil,
            eatTagName: nil
        )
    }

    func timeline(for configuration: WidgetAppearanceIntent, in context: Context) async -> Timeline<RationWidgetEntry> {
        let cache = await WidgetSnapshotLoader.load(force: false, tag: nil)
        return WidgetTimelines.make(cache: cache, appearance: configuration.appearance, eatTagSlug: nil, eatTagName: nil)
    }
}

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var systemScheme
    @Environment(\.widgetRenderingMode) private var renderingMode
    let entry: RationWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(wordmark: "TODAY", source: weekday, destination: WidgetLinks.today, palette: palette)
            if entry.cache.isReady, let today = entry.cache.snapshot?.today {
                if family == .systemSmall {
                    small(today)
                } else {
                    mealList(today)
                    if HomeWidgetCopy.energyLine(remainingKcal: today.remainingKcal) != nil, let goal = today.goalKcal {
                        MacroBar(
                            label: "Calories",
                            remaining: today.remainingKcal ?? 0,
                            goal: goal,
                            unit: "kcal",
                            palette: palette
                        )
                    }
                    if family == .systemLarge {
                        macroBars(today)
                    }
                }
            } else {
                WidgetEmptyLine(text: HomeWidgetCopy.calmLine(for: entry.cache.state), palette: palette)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(WidgetLinks.today)
    }

    private var palette: WidgetPalette {
        WidgetPalette.resolve(appearance: entry.appearance, system: systemScheme, rendering: renderingMode)
    }

    private var weekday: String {
        let formatter = DateFormatter()
        formatter.locale = Locale.current
        formatter.setLocalizedDateFormatFromTemplate("EEEE")
        return formatter.string(from: entry.date)
    }

    @ViewBuilder
    private func small(_ today: HomeWidgetSnapshot.Today) -> some View {
        if today.status == "planned" {
            if let slot = today.slotType {
                slotMark(slot, emphasized: true)
            }
            Text(HomeWidgetCopy.todayTitle(status: today.status, title: today.title))
                .font(WidgetType.title())
                .foregroundStyle(palette.carbon)
                .lineLimit(2)
        } else {
            WidgetEmptyLine(text: HomeWidgetCopy.todayTitle(status: today.status, title: today.title), palette: palette)
        }
    }

    private func mealList(_ today: HomeWidgetSnapshot.Today) -> some View {
        let meals = Array(today.meals.prefix(4))
        return VStack(alignment: .leading, spacing: 4) {
            if meals.isEmpty {
                WidgetEmptyLine(text: HomeWidgetCopy.todayTitle(status: today.status, title: today.title), palette: palette)
            } else {
                ForEach(Array(meals.enumerated()), id: \.offset) { _, meal in
                    HStack(spacing: 8) {
                        slotMark(meal.slotType, emphasized: !meal.cooked)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(meal.name)
                                .font(WidgetType.detail())
                                .foregroundStyle(meal.cooked ? palette.muted : palette.carbon)
                                .lineLimit(1)
                            if meal.cooked {
                                Text("Cooked")
                                    .font(WidgetType.detail())
                                    .foregroundStyle(palette.muted)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    private func slotMark(_ slotType: String, emphasized: Bool) -> some View {
        HStack(spacing: 4) {
            Image(systemName: WidgetSlot.systemImage(for: slotType))
                .font(.caption2.weight(.semibold))
                .foregroundStyle(palette.muted)
                .frame(width: 22, height: 22)
                .background(palette.platinum)
                .clipShape(Circle())
            Text(HomeWidgetCopy.slotLabel(slotType) ?? slotType)
                .font(WidgetType.detail())
                .foregroundStyle(emphasized ? palette.carbon : palette.muted)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private func macroBars(_ today: HomeWidgetSnapshot.Today) -> some View {
        if let protein = today.protein {
            MacroBar(label: "Protein", remaining: protein.remaining, goal: protein.goal, unit: "g", palette: palette)
        }
        if let carbs = today.carbs {
            MacroBar(label: "Carbs", remaining: carbs.remaining, goal: carbs.goal, unit: "g", palette: palette)
        }
        if let fat = today.fat {
            MacroBar(label: "Fat", remaining: fat.remaining, goal: fat.goal, unit: "g", palette: palette)
        }
    }
}
