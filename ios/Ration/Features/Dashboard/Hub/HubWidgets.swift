import SwiftUI

struct HubStatsWidget: View {
    let data: HubResponse

    var body: some View {
        GlassCard {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                statCell("Cargo", value: data.cargoStats.totalItems, icon: "shippingbox")
                statCell("Expiring", value: data.cargoStats.expiringCount, icon: "clock.badge.exclamationmark", highlight: data.cargoStats.expiringCount > 0)
                statCell("Meals ready", value: data.mealMatches.filter(\.canMake).count, icon: "fork.knife")
                statCell("Supply", value: data.latestSupplyList?.items.filter { !$0.isPurchased }.count ?? 0, icon: "cart")
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

    var body: some View {
        GlassCard {
            let total = list?.items.count ?? 0
            let unchecked = list?.items.filter { !$0.isPurchased }.count ?? 0
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Supply list").rationHeadline()
                    Text("\(unchecked) of \(total) to buy").rationCaption()
                }
                Spacer()
                Image(systemName: "cart").foregroundStyle(Theme.hyperGreen)
            }
        }
    }
}

struct MealsReadyWidget: View {
    let matches: [MealMatch]

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Meals ready").rationHeadline()
                let ready = matches.filter(\.canMake)
                if ready.isEmpty {
                    Text("No meals ready with current Cargo").rationCaption()
                } else {
                    ForEach(ready.prefix(4)) { match in
                        HStack {
                            Text(match.meal.name.capitalized).rationBody()
                            Spacer()
                            Text("\(Int(match.matchPercentage))%").rationCaption().foregroundStyle(Theme.hyperGreen)
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
                Text("Partial meals").rationHeadline()
                let partial = matches.filter { !$0.canMake && $0.matchPercentage >= 50 }
                if partial.isEmpty {
                    Text("No partial matches").rationCaption()
                } else {
                    ForEach(partial.prefix(4)) { match in
                        HStack {
                            Text(match.meal.name.capitalized).rationBody()
                            Spacer()
                            Text("\(Int(match.matchPercentage))%").rationCaption()
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
                Text("Expiring within \(alertDays)d").rationHeadline()
                if items.isEmpty {
                    Text("Nothing expiring soon").rationCaption()
                } else {
                    ForEach(items.prefix(5)) { item in
                        HStack {
                            Text(item.name.capitalized).rationBody()
                            Spacer()
                            if let expires = item.expiresAt {
                                Text(expires.formatted(date: .abbreviated, time: .omitted)).rationCaption()
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

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Upcoming plan").rationHeadline()
                if let entries = preview?.entries, !entries.isEmpty {
                    ForEach(entries.prefix(5)) { entry in
                        HStack {
                            Text(entry.date).rationCaption()
                            Text(entry.mealName.capitalized).rationBody()
                            Spacer()
                            Text(entry.slotType.capitalized).rationCaption()
                        }
                    }
                } else {
                    Text("No meals planned this week").rationCaption()
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
