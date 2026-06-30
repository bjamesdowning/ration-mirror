import SwiftUI

struct HubStatsWidget: View {
    let data: HubResponse

    var body: some View {
        GlassCard {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                statCell("Cargo", value: data.cargoStats.totalItems, icon: "shippingbox")
                statCell("Expiring", value: data.cargoStats.expiringCount, icon: "clock.badge.exclamationmark", highlight: data.cargoStats.expiringCount > 0)
                statCell("Meals ready", value: data.mealMatches.filter(\.canMake).count, icon: "fork.knife")
                statCell("Supply", value: data.latestSupplyList?.resolvedUncheckedCount ?? 0, icon: "cart")
            }
        }
    }

    private func statCell(_ label: String, value: Int, icon: String, highlight: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: icon)
                .foregroundStyle(highlight ? Theme.warning : Theme.carbon)
            Text("\(value)").font(Typography.display()).foregroundStyle(highlight ? Theme.warning : Theme.carbon)
            Text(label).rationCaption()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SupplyPreviewWidget: View {
    let list: SupplyList?
    var onToggleItem: ((SupplyItem, Bool) async -> Void)?
    var onOpenSupply: (() -> Void)?

    @State private var checkedAnimationIDs: Set<String> = []

    private var displayItems: [SupplyItem] {
        guard let list else { return [] }
        let unchecked = list.items.filter { !$0.isPurchased || checkedAnimationIDs.contains($0.id) }
        return Array(unchecked.prefix(6))
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
                            HStack(spacing: 10) {
                                Image(systemName: isChecked ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(isChecked ? Theme.hyperGreen : Theme.muted)
                                Text(item.name.capitalized)
                                    .rationBody()
                                    .strikethrough(isChecked)
                                    .foregroundStyle(isChecked ? Theme.muted : Theme.carbon)
                                Spacer()
                                Text("\(item.quantity.formatted()) \(item.unit)")
                                    .rationCaption()
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(isChecked)
                    }
                }
            }
        }
    }
}

struct MealsReadyWidget: View {
    let matches: [MealMatch]

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HubWidgetHeader(
                    title: "Meals ready",
                    systemImage: "fork.knife",
                    trailing: "\(matches.filter(\.canMake).count)"
                )
                let ready = matches.filter(\.canMake)
                if ready.isEmpty {
                    Text("No meals ready with current Cargo").rationCaption()
                } else {
                    ForEach(ready.prefix(4)) { match in
                        HStack(spacing: 10) {
                            HubMatchRing(percentage: match.matchPercentage)
                            Text(match.meal.name.capitalized)
                                .rationBody()
                                .lineLimit(1)
                            Spacer()
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct MealsPartialWidget: View {
    let matches: [MealMatch]

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HubWidgetHeader(title: "Partial meals", systemImage: "chart.bar")
                let partial = matches.filter { !$0.canMake && $0.matchPercentage >= 50 }
                if partial.isEmpty {
                    Text("No partial matches").rationCaption()
                } else {
                    ForEach(partial.prefix(4)) { match in
                        HStack(spacing: 10) {
                            HubMatchRing(percentage: match.matchPercentage)
                            Text(match.meal.name.capitalized).rationBody().lineLimit(1)
                            Spacer()
                        }
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
                    ForEach(items.prefix(5)) { item in
                        HStack {
                            Text(item.name.capitalized).rationBody().lineLimit(1)
                            Spacer()
                            if let expires = item.expiresAt {
                                HubUrgencyLabel(date: expires)
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct ManifestPreviewWidget: View {
    let preview: ManifestPreviewData?

    private var previewDates: [String] {
        guard let entries = preview?.entries else { return [] }
        let unique = Array(Set(entries.map(\.date))).sorted()
        return Array(unique.prefix(3))
    }

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HubWidgetHeader(title: "Upcoming plan", systemImage: "calendar")
                if previewDates.isEmpty {
                    Text("No meals planned this week").rationCaption()
                } else {
                    HStack(alignment: .top, spacing: 8) {
                        ForEach(previewDates, id: \.self) { date in
                            manifestDayColumn(date: date, entries: preview?.entries ?? [])
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func manifestDayColumn(date: String, entries: [ManifestPreviewEntry]) -> some View {
        let dayEntries = entries.filter { $0.date == date }
        let isToday = date == ManifestDateHelpers.todayISO()
        return VStack(alignment: .leading, spacing: 6) {
            Text(HubDateFormat.smartLabel(isoDate: date))
                .font(Typography.caption())
                .foregroundStyle(isToday ? Color.black : Theme.carbon)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .frame(maxWidth: .infinity)
                .background(isToday ? Theme.hyperGreen : Theme.platinum)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            ForEach(dayEntries.prefix(3)) { entry in
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.mealName.capitalized)
                        .font(Typography.caption())
                        .lineLimit(1)
                    HubSlotBadge(slotType: entry.slotType)
                }
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
