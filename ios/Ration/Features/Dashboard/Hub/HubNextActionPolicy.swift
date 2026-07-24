import Foundation

/// Priority next-action card for Hub (expiring → supply → expired → galley → scan).
enum HubNextActionPolicy {
    static func nextAction(
        for data: HubResponse
    ) -> (key: String, title: String, detail: String, icon: String)? {
        if data.cargoStats.expiringCount > 0 {
            return ("expiring", "Use expiring cargo", "\(data.cargoStats.expiringCount) items expiring soon", "clock.badge.exclamationmark")
        }
        let unchecked = data.latestSupplyList?.resolvedUncheckedCount ?? 0
        if unchecked > 0 {
            return ("supply", "Finish supply run", "\(unchecked) items to buy", "cart")
        }
        if data.cargoStats.expiredCount > 0 {
            return ("expired", "Clear expired cargo", "\(data.cargoStats.expiredCount) expired items", "xmark.bin")
        }
        if data.mealMatches.isEmpty {
            return ("galley", "Stock Galley", "Add your first meal", "fork.knife")
        }
        return ("scan", "Scan items", "Add cargo from a photo", "camera.viewfinder")
    }
}
