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
    var size: String = "md"
    var onToggleItem: ((SupplyItem, Bool) async -> Void)?
    var onOpenSupply: (() -> Void)?
    var onSelectCargo: ((String) -> Void)?

    @State private var checkedAnimationIDs: Set<String> = []

    private var rowLimit: Int { HubLayoutEngine.rowLimit(for: size) }

    private var displayItems: [SupplyItem] {
        guard let list else { return [] }
        let unchecked = list.items.filter { !$0.isPurchased || checkedAnimationIDs.contains($0.id) }
        return Array(unchecked.prefix(rowLimit))
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
    var size: String = "md"
    var onSelectMeal: ((Meal) -> Void)?

    init(title: String = "Meals ready", matches: [MealMatch], size: String = "md", onSelectMeal: ((Meal) -> Void)? = nil) {
        self.title = title
        self.matches = matches
        self.size = size
        self.onSelectMeal = onSelectMeal
    }

    private var rowLimit: Int { HubLayoutEngine.rowLimit(for: size) }

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
                    ForEach(ready.prefix(rowLimit)) { match in
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
    var size: String = "md"
    var onSelectMeal: ((Meal) -> Void)?

    private var rowLimit: Int { HubLayoutEngine.rowLimit(for: size) }

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HubWidgetHeader(title: "Partial meals", systemImage: "chart.bar")
                let partial = matches.filter { !$0.canMake && $0.matchPercentage >= 50 }
                if partial.isEmpty {
                    Text("No partial matches").rationCaption()
                } else {
                    ForEach(partial.prefix(rowLimit)) { match in
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
    var size: String = "md"
    var onSelectItem: ((CargoItem) -> Void)?

    private var rowLimit: Int { HubLayoutEngine.rowLimit(for: size) }

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
                    ForEach(items.prefix(rowLimit)) { item in
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
    var size: String = "md"
    var onSelectEntry: ((ManifestPreviewEntry) -> Void)?
    var onOpenManifest: (() -> Void)?

    private var effectiveDaySpan: Int {
        let spanCap = size == "sm" ? 1 : size == "lg" ? 7 : 3
        return min(max(daySpan, 1), spanCap)
    }

    private var previewDates: [String] {
        guard let entries = preview?.entries else { return [] }
        let unique = Array(Set(entries.map(\.date))).sorted()
        return Array(unique.prefix(effectiveDaySpan))
    }

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Button {
                    onOpenManifest?()
                } label: {
                    HubWidgetHeader(title: effectiveDaySpan == 1 ? "Today" : "Upcoming plan", systemImage: "calendar")
                }
                .buttonStyle(.plain)

                if previewDates.isEmpty {
                    Text("No meals planned this week").rationCaption()
                } else if effectiveDaySpan == 1, let today = previewDates.first {
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
            ForEach(dayEntries.prefix(effectiveDaySpan == 1 ? 10 : HubLayoutEngine.rowLimit(for: size))) { entry in
                Button {
                    onSelectEntry?(entry)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.mealName.capitalized)
                            .font(Typography.caption())
                            .lineLimit(effectiveDaySpan == 1 ? nil : 2)
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
