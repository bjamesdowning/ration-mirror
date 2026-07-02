import SwiftUI

enum CargoExpiryBand: Equatable {
    case hidden
    case green
    case yellow
    case red
    case expired

    static func band(expiresAt: Date?, reference: Date = Date(), isExpiredStatus: Bool = false) -> CargoExpiryBand {
        guard let expiresAt else { return .hidden }
        if isExpiredStatus || expiresAt < reference {
            return .expired
        }
        let days = daysUntil(expiresAt: expiresAt, reference: reference)
        if days <= 2 { return .red }
        if days <= 7 { return .yellow }
        return .green
    }

    static func daysUntil(expiresAt: Date, reference: Date = Date()) -> Int {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: reference)
        let end = calendar.startOfDay(for: expiresAt)
        return calendar.dateComponents([.day], from: start, to: end).day ?? 0
    }

    var color: Color {
        switch self {
        case .hidden: return .clear
        case .green: return Theme.hyperGreen
        case .yellow: return Theme.warning
        case .red, .expired: return Theme.danger
        }
    }
}

struct CargoExpiryGauge: View {
    let expiresAt: Date?
    var reference: Date = Date()
    var isExpiredStatus: Bool = false

    private var band: CargoExpiryBand {
        CargoExpiryBand.band(
            expiresAt: expiresAt,
            reference: reference,
            isExpiredStatus: isExpiredStatus
        )
    }

    var body: some View {
        if band == .hidden {
            EmptyView()
        } else {
            Circle()
                .stroke(band.color, lineWidth: 3)
                .frame(width: 14, height: 14)
                .accessibilityHidden(true)
        }
    }
}
