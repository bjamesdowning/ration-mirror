import SwiftUI
import WidgetKit

enum WidgetTheme {
    static let ceramic = Color(red: 0.973, green: 0.976, blue: 0.980)
    static let carbon = Color(red: 0.067, green: 0.067, blue: 0.067)
    static let hyperGreen = Color(red: 0, green: 0.878, blue: 0.533)
    static let muted = Color(red: 0.42, green: 0.45, blue: 0.48)
}

struct SupplyHomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.mayutic.ration.supply", provider: RationWidgetProvider()) { entry in
            SupplyWidgetView(entry: entry)
                .containerBackground(WidgetTheme.ceramic, for: .widget)
        }
        .configurationDisplayName("Supply")
        .description("Unchecked items on your Live list. Check them off without docking into Cargo.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}

struct AteHomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.mayutic.ration.ate", provider: RationWidgetProvider()) { entry in
            AteWidgetView(entry: entry)
                .containerBackground(WidgetTheme.ceramic, for: .widget)
        }
        .configurationDisplayName("Ate")
        .description("Eat one piece from Cargo, or open Ration to choose grams.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct TodayHomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.mayutic.ration.today", provider: RationWidgetProvider()) { entry in
            TodayWidgetView(entry: entry)
                .containerBackground(WidgetTheme.ceramic, for: .widget)
        }
        .configurationDisplayName("Today")
        .description("The next meal on Manifest, plus what is still on the Live list.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct SupplyWidgetView: View {
    @Environment(\.widgetFamily) private var family
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
            .widgetURL(URL(string: "ration://supply"))
        case .systemSmall:
            small
        default:
            medium
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 8) {
            header(showsAdd: true)
            Spacer(minLength: 0)
            Text(countText)
                .font(.title.monospacedDigit().weight(.semibold))
                .foregroundStyle(WidgetTheme.carbon)
            Text(statusOrHeadline)
                .font(.caption)
                .foregroundStyle(WidgetTheme.muted)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "ration://supply"))
    }

    private var medium: some View {
        VStack(alignment: .leading, spacing: 6) {
            header(showsAdd: true)
            if let line = entry.cache.statusLine {
                Text(line).font(.caption2).foregroundStyle(WidgetTheme.muted)
            }
            if entry.cache.isReady, let items = entry.cache.snapshot?.supply.items, !items.isEmpty {
                ForEach(items.prefix(5)) { item in
                    Button(intent: MarkSupplyPurchasedIntent(itemId: item.id)) {
                        HStack(spacing: 8) {
                            Image(systemName: "circle")
                                .font(.caption)
                                .foregroundStyle(WidgetTheme.hyperGreen)
                            Text(item.name)
                                .font(.caption)
                                .foregroundStyle(WidgetTheme.carbon)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Mark \(item.name) purchased")
                }
            } else {
                Text(emptyCopy)
                    .font(.caption)
                    .foregroundStyle(WidgetTheme.muted)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "ration://supply"))
    }

    private func header(showsAdd: Bool) -> some View {
        HStack {
            Link(destination: URL(string: "ration://supply")!) {
                Text("SUPPLY")
                    .font(.caption2.weight(.semibold).monospaced())
                    .foregroundStyle(WidgetTheme.muted)
            }
            Spacer()
            if showsAdd, entry.cache.isReady {
                Link(destination: URL(string: "ration://supply?compose=1")!) {
                    Image(systemName: "plus")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(WidgetTheme.hyperGreen)
                }
                .accessibilityLabel("Add items")
            }
        }
    }

    private var count: Int { entry.cache.snapshot?.supply.uncheckedCount ?? 0 }

    private var countText: String {
        guard entry.cache.isReady else { return "—" }
        return "\(count)"
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
        guard entry.cache.isReady else { return calmLine }
        let names = entry.cache.snapshot?.supply.items.prefix(2).map(\.name) ?? []
        return names.isEmpty ? "Nothing to buy" : names.joined(separator: ", ")
    }

    private var statusOrHeadline: String {
        if let line = entry.cache.statusLine { return line }
        guard entry.cache.isReady else { return calmLine }
        return HomeWidgetCopy.supplyHeadline(uncheckedCount: count)
    }

    private var emptyCopy: String {
        guard entry.cache.isReady else { return calmLine }
        return "Nothing to buy"
    }

    private var calmLine: String {
        switch entry.cache.state {
        case "signedOut": return "Open Ration to sign in"
        case "disabled": return "Widgets are turned off"
        default: return "Open Ration"
        }
    }
}

struct AteWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: RationWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Link(destination: URL(string: "ration://cargo")!) {
                Text("ATE")
                    .font(.caption2.weight(.semibold).monospaced())
                    .foregroundStyle(WidgetTheme.muted)
            }
            if let line = entry.cache.statusLine {
                Text(line).font(.caption2).foregroundStyle(WidgetTheme.muted)
            }
            if entry.cache.isReady, entry.cache.snapshot?.ate.available == true {
                let limit = family == .systemSmall ? 2 : 4
                let foods = Array((entry.cache.snapshot?.ate.foods ?? []).prefix(limit))
                if foods.isEmpty {
                    Text("Nothing ready to eat")
                        .font(.caption)
                        .foregroundStyle(WidgetTheme.muted)
                } else {
                    ForEach(foods) { food in
                        foodRow(food)
                    }
                }
            } else if entry.cache.isReady {
                Text("Open Cargo to eat")
                    .font(.caption)
                    .foregroundStyle(WidgetTheme.muted)
            } else {
                Text(calmLine)
                    .font(.caption)
                    .foregroundStyle(WidgetTheme.muted)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "ration://cargo"))
    }

    @ViewBuilder
    private func foodRow(_ food: HomeWidgetAteFood) -> some View {
        if food.eatsOneStep {
            Button(intent: EatCargoStepIntent(food: food)) {
                rowLabel(food.name, systemImage: "fork.knife")
            }
            .buttonStyle(.plain)
            .disabled(entry.cache.inFlightCargoIds.contains(food.cargoId))
            .accessibilityLabel("Eat one \(food.unit) of \(food.name)")
        } else if let url = URL(string: "ration://cargo/eat?id=\(food.cargoId)") {
            Link(destination: url) {
                rowLabel(food.name, systemImage: "arrow.up.right")
            }
            .accessibilityLabel("Choose an amount of \(food.name)")
        }
    }

    private func rowLabel(_ name: String, systemImage: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.caption2)
                .foregroundStyle(WidgetTheme.hyperGreen)
            Text(name)
                .font(.caption)
                .foregroundStyle(WidgetTheme.carbon)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
    }

    private var calmLine: String {
        switch entry.cache.state {
        case "signedOut": return "Open Ration to sign in"
        case "disabled": return "Widgets are turned off"
        default: return "Open Ration"
        }
    }
}

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: RationWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("TODAY")
                .font(.caption2.weight(.semibold).monospaced())
                .foregroundStyle(WidgetTheme.muted)
            if entry.cache.isReady, let today = entry.cache.snapshot?.today {
                Text(HomeWidgetCopy.todayTitle(status: today.status, title: today.title))
                    .font(.headline)
                    .foregroundStyle(WidgetTheme.carbon)
                    .lineLimit(2)
                if family == .systemMedium {
                    Text(HomeWidgetCopy.supplyHeadline(uncheckedCount: today.uncheckedSupplyCount))
                        .font(.caption)
                        .foregroundStyle(WidgetTheme.muted)
                    if let energy = HomeWidgetCopy.energyLine(remainingKcal: today.remainingKcal) {
                        energyBar(today: today, label: energy)
                    }
                }
            } else {
                Text(calmLine)
                    .font(.caption)
                    .foregroundStyle(WidgetTheme.muted)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "ration://manifest/today"))
    }

    private func energyBar(today: HomeWidgetSnapshot.Today, label: String) -> some View {
        let goal = Double(today.goalKcal ?? 0)
        let remaining = Double(today.remainingKcal ?? 0)
        let consumed = goal > 0 ? max(0, goal - remaining) : 0
        let fraction = goal > 0 ? min(1, consumed / goal) : 0
        return VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption2.monospacedDigit())
                .foregroundStyle(WidgetTheme.carbon)
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(WidgetTheme.muted.opacity(0.2))
                    Capsule()
                        .fill(WidgetTheme.hyperGreen)
                        .frame(width: proxy.size.width * fraction)
                }
            }
            .frame(height: 4)
        }
    }

    private var calmLine: String {
        switch entry.cache.state {
        case "signedOut": return "Open Ration to sign in"
        case "disabled": return "Widgets are turned off"
        default: return "Open Ration"
        }
    }
}
