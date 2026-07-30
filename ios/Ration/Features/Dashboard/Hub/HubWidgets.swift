import SwiftUI

struct HubStatsWidget: View {
    let data: HubResponse
    var size: String = "lg"
    var onOpenCargo: (() -> Void)?
    var onOpenExpiring: (() -> Void)?
    var onOpenGalley: (() -> Void)?
    var onOpenSupply: (() -> Void)?

    private var compact: Bool { size == "sm" }
    /// Carbon at low opacity — `Theme.platinum` matches `Theme.surface` in dark mode.
    private var hairline: Color { Theme.carbon.opacity(0.12) }
    private var mealsReadyCount: Int { data.mealMatches.filter(\.canMake).count }

    var body: some View {
        GlassCard {
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    statCell("Cargo", value: data.cargoStats.totalItems, icon: "shippingbox", action: onOpenCargo)
                    verticalHairline
                    statCell(
                        "Expiring",
                        value: data.cargoStats.expiringCount,
                        icon: "clock.badge.exclamationmark",
                        highlight: data.cargoStats.expiringCount > 0,
                        action: onOpenExpiring
                    )
                }
                horizontalHairline
                HStack(spacing: 0) {
                    statCell("Meals ready", value: mealsReadyCount, icon: "fork.knife", action: onOpenGalley)
                    verticalHairline
                    statCell(
                        "Supply",
                        value: data.latestSupplyList?.resolvedUncheckedCount ?? 0,
                        icon: "cart",
                        action: onOpenSupply
                    )
                }
            }
            .padding(.horizontal, -4)
            .padding(.vertical, -2)
        }
    }

    private var verticalHairline: some View {
        Rectangle().fill(hairline).frame(width: 1)
    }

    private var horizontalHairline: some View {
        Rectangle().fill(hairline).frame(height: 1)
    }

    private func statCell(
        _ label: String,
        value: Int,
        icon: String,
        highlight: Bool = false,
        action: (() -> Void)?
    ) -> some View {
        Button {
            action?()
        } label: {
            VStack(alignment: .center, spacing: compact ? 2 : 4) {
                Image(systemName: icon)
                    .font(Typography.heroIcon(compact ? 13 : 15))
                    .foregroundStyle(highlight ? Theme.warning : Theme.carbon)
                Text("\(value)")
                    .font(compact ? Typography.headline() : Typography.display())
                    .foregroundStyle(highlight ? Theme.warning : Theme.carbon)
                    .monospacedDigit()
                if !compact {
                    Text(label)
                        .rationCaption()
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .center)
            .padding(.vertical, compact ? 8 : 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label), \(value)")
    }
}

struct SupplyPreviewWidget: View {
    let list: SupplyList?
    var cargoLinkRows: [CargoLinkResolver.Row] = []
    var itemLimit: Int = HubLayoutEngine.defaultDisplayLimit
    var onToggleItem: ((SupplyItem, Bool) async -> Void)?
    var onOpenSupply: (() -> Void)?
    var onSelectCargo: ((String) -> Void)?

    @State private var checkedAnimationIDs: Set<String> = []

    private var displayItems: [SupplyItem] {
        guard let list else { return [] }
        let unchecked = list.items.filter { !$0.isPurchased || checkedAnimationIDs.contains($0.id) }
        return Array(unchecked.prefix(itemLimit))
    }

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Button {
                    onOpenSupply?()
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Supply list").rationHeadline()
                            let total = list?.resolvedItemCount ?? 0
                            let unchecked = list?.resolvedUncheckedCount ?? 0
                            Text("\(unchecked) of \(total) to buy").rationCaption()
                        }
                        Spacer()
                        Image(systemName: "cart").foregroundStyle(Theme.hyperGreen)
                    }
                }
                .buttonStyle(.plain)

                if let list, list.resolvedItemCount > 0 {
                    HubProgressBar(
                        progress: list.resolvedItemCount > 0
                            ? Double(list.resolvedPurchasedCount) / Double(list.resolvedItemCount)
                            : 0
                    )
                }

                if !displayItems.isEmpty {
                    ForEach(displayItems) { item in
                        let isChecked = item.isPurchased || checkedAnimationIDs.contains(item.id)
                        let cargoId = CargoLinkResolver.resolveCargoId(forName: item.name, in: cargoLinkRows)
                        HStack(spacing: 10) {
                            Button {
                                guard !isChecked else { return }
                                Task {
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        _ = checkedAnimationIDs.insert(item.id)
                                    }
                                    await onToggleItem?(item, true)
                                    try? await Task.sleep(nanoseconds: 400_000_000)
                                    withAnimation {
                                        _ = checkedAnimationIDs.remove(item.id)
                                    }
                                }
                            } label: {
                                Image(systemName: isChecked ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(isChecked ? Theme.hyperGreen : Theme.muted)
                            }
                            .buttonStyle(.plain)
                            .disabled(isChecked)
                            .accessibilityLabel(isChecked ? "Purchased \(item.name)" : "Mark \(item.name) purchased")
                            .accessibilityAddTraits(isChecked ? [.isSelected] : [])

                            if let cargoId, !isChecked, let onSelectCargo {
                                Button {
                                    onSelectCargo(cargoId)
                                } label: {
                                    Text(item.name.capitalized)
                                        .rationBody()
                                        .foregroundStyle(Theme.carbon)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .buttonStyle(.plain)
                            } else {
                                Text(item.name.capitalized)
                                    .rationBody()
                                    .strikethrough(isChecked)
                                    .foregroundStyle(isChecked ? Theme.muted : Theme.carbon)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }

                            DisplayQuantityLabel(
                                quantity: item.quantity,
                                unit: item.unit,
                                baseQuantity: item.baseQuantity,
                                baseUnit: item.baseUnit,
                                ingredientName: item.name
                            )
                            .rationCaption()
                        }
                    }
                }
            }
        }
    }
}

struct MealsReadyWidget: View {
    let title: String
    let matches: [MealMatch]
    var itemLimit: Int = HubLayoutEngine.defaultDisplayLimit
    var onSelectMeal: ((Meal) -> Void)?

    init(
        title: String = "Meals ready",
        matches: [MealMatch],
        itemLimit: Int = HubLayoutEngine.defaultDisplayLimit,
        onSelectMeal: ((Meal) -> Void)? = nil
    ) {
        self.title = title
        self.matches = matches
        self.itemLimit = itemLimit
        self.onSelectMeal = onSelectMeal
    }

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HubWidgetHeader(
                    title: title,
                    systemImage: "fork.knife",
                    trailing: "\(matches.filter(\.canMake).count)"
                )
                let ready = matches.filter(\.canMake)
                if ready.isEmpty {
                    Text("No meals ready with current Cargo").rationCaption()
                } else {
                    ForEach(ready.prefix(itemLimit)) { match in
                        Button {
                            onSelectMeal?(match.meal)
                        } label: {
                            HStack(spacing: 10) {
                                HubMatchRing(percentage: match.matchPercentage)
                                Text(match.meal.name.capitalized)
                                    .rationBody()
                                    .lineLimit(2)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(Theme.muted)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Open \(match.meal.name)")
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct MealsPartialWidget: View {
    let matches: [MealMatch]
    var itemLimit: Int = HubLayoutEngine.defaultDisplayLimit
    var onSelectMeal: ((Meal) -> Void)?

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HubWidgetHeader(title: "Partial meals", systemImage: "chart.bar")
                let partial = matches.filter { !$0.canMake && $0.matchPercentage >= 50 }
                if partial.isEmpty {
                    Text("No partial matches").rationCaption()
                } else {
                    ForEach(partial.prefix(itemLimit)) { match in
                        Button {
                            onSelectMeal?(match.meal)
                        } label: {
                            HStack(spacing: 10) {
                                HubMatchRing(percentage: match.matchPercentage)
                                Text(match.meal.name.capitalized).rationBody().lineLimit(2)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(Theme.muted)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct CargoExpiringWidget: View {
    let items: [CargoItem]
    let alertDays: Int
    var itemLimit: Int = HubLayoutEngine.defaultDisplayLimit
    var onSelectItem: ((CargoItem) -> Void)?

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HubWidgetHeader(
                    title: "Expiring",
                    systemImage: "clock.badge.exclamationmark",
                    trailing: "\(alertDays)d"
                )
                if items.isEmpty {
                    Text("Nothing expiring soon").rationCaption()
                } else {
                    ForEach(items.prefix(itemLimit)) { item in
                        Button {
                            onSelectItem?(item)
                        } label: {
                            HStack {
                                Text(item.name.capitalized).rationBody().lineLimit(1)
                                Spacer()
                                if let expires = item.expiresAt {
                                    HubUrgencyLabel(date: expires)
                                }
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(Theme.muted)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Open \(item.name)")
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct ManifestPreviewWidget: View {
    let preview: ManifestPreviewData?
    var daySpan: Int = 3
    var onSelectEntry: ((ManifestPreviewEntry) -> Void)?
    var onOpenManifest: (() -> Void)?

    /// Entries shown per day column when spanning multiple days.
    private static let entriesPerDayColumn = 4

    private var previewDates: [String] {
        guard let entries = preview?.entries else { return [] }
        let unique = Array(Set(entries.map(\.date))).sorted()
        return Array(unique.prefix(max(daySpan, 1)))
    }

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Button {
                    onOpenManifest?()
                } label: {
                    HubWidgetHeader(title: daySpan == 1 ? "Today" : "Upcoming plan", systemImage: "calendar")
                }
                .buttonStyle(.plain)

                if previewDates.isEmpty {
                    Text("No meals planned this week").rationCaption()
                } else if daySpan == 1, let today = previewDates.first {
                    todayHero(date: today, entries: preview?.entries ?? [])
                } else {
                    HStack(alignment: .top, spacing: 8) {
                        ForEach(previewDates, id: \.self) { date in
                            manifestDayColumn(date: date, entries: preview?.entries ?? [])
                        }
                    }
                }

                if onOpenManifest != nil {
                    Button("Edit plan") { onOpenManifest?() }
                        .font(Typography.caption())
                        .foregroundStyle(Theme.hyperGreen)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func todayHero(date: String, entries: [ManifestPreviewEntry]) -> some View {
        let dayEntries = entries.filter { $0.date == date }
        return VStack(alignment: .leading, spacing: 8) {
            ForEach(dayEntries) { entry in
                Button {
                    onSelectEntry?(entry)
                } label: {
                    HStack(spacing: 10) {
                        HubSlotBadge(slotType: entry.slotType)
                        Text(entry.mealName.capitalized)
                            .rationBody()
                            .multilineTextAlignment(.leading)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func manifestDayColumn(date: String, entries: [ManifestPreviewEntry]) -> some View {
        let dayEntries = entries.filter { $0.date == date }
        let isToday = date == ManifestDateHelpers.todayISO()
        return VStack(alignment: .leading, spacing: 6) {
            Text(HubDateFormat.smartLabel(isoDate: date))
                .font(Typography.caption())
                .foregroundStyle(isToday ? Theme.onHyperGreen : Theme.carbon)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .frame(maxWidth: .infinity)
                .background(isToday ? Theme.hyperGreen : Theme.platinum)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            ForEach(dayEntries.prefix(daySpan == 1 ? 10 : Self.entriesPerDayColumn)) { entry in
                Button {
                    onSelectEntry?(entry)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.mealName.capitalized)
                            .font(Typography.caption())
                            .lineLimit(daySpan == 1 ? nil : 2)
                            .multilineTextAlignment(.leading)
                        HubSlotBadge(slotType: entry.slotType)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Theme.platinum, lineWidth: 1)
        )
    }
}

struct FlightRecorderWidget: View {
    let activity: FlightRecorderActivity?
    var size: String = "md"

    private var compact: Bool { size == "sm" }
    private var recentLimit: Int { compact ? 3 : 5 }

    private static let eventLabels: [String: String] = [
        "galley_cooked": "Cooked",
        "manifest_consumed": "Manifest",
        "supply_docked": "Docked",
        "cargo_expired": "Expired",
        "cargo_jettisoned": "Jettisoned",
    ]

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    HubWidgetHeader(title: "Flight Recorder", systemImage: "waveform.path.ecg")
                    Spacer()
                    Text("This week")
                        .rationCaption()
                }

                if let activity {
                    let totals = activity.stats.totals
                    LazyVGrid(
                        columns: Array(
                            repeating: GridItem(.flexible(), spacing: 8),
                            count: compact ? 2 : 4
                        ),
                        spacing: 8
                    ) {
                        statChip("Cooked", value: totals.cooked)
                        statChip("Docked", value: totals.docked)
                        statChip("Expired", value: totals.expired, highlight: totals.expired > 0)
                        statChip("Jettisoned", value: totals.jettisoned)
                    }

                    if activity.recent.isEmpty {
                        Text("No events in the last 7 days.")
                            .rationCaption()
                    } else {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(activity.recent.prefix(recentLimit)) { event in
                                HStack(alignment: .firstTextBaseline, spacing: 8) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(event.subjectName)
                                            .rationBody()
                                            .lineLimit(1)
                                        Text(Self.eventLabels[event.eventType] ?? event.eventType)
                                            .rationCaption()
                                    }
                                    Spacer(minLength: 8)
                                    Text(relativeLabel(iso: event.occurredAt))
                                        .rationCaption()
                                }
                                .padding(.vertical, 8)
                                if event.id != activity.recent.prefix(recentLimit).last?.id {
                                    Divider().overlay(Theme.carbon.opacity(0.12))
                                }
                            }
                        }
                    }
                } else {
                    Text("No Flight Recorder activity yet. Cook a meal or dock supply to start recording.")
                        .rationCaption()
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func statChip(_ label: String, value: Int, highlight: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
            Text("\(value)")
                .font(Typography.headline())
                .foregroundStyle(highlight ? Theme.warning : Theme.carbon)
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(highlight ? Theme.warning.opacity(0.12) : Theme.platinum.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func relativeLabel(iso: String) -> String {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        guard let date = withFraction.date(from: iso) ?? plain.date(from: iso) else {
            return iso
        }
        let minutes = Int(Date().timeIntervalSince(date) / 60)
        if minutes < 1 { return "just now" }
        if minutes < 60 { return "\(minutes)m ago" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h ago" }
        return "\(hours / 24)d ago"
    }
}
