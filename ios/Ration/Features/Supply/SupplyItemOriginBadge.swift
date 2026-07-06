import SwiftUI

/// Hub-icon badges showing whether a supply row came from Manifest, Galley, Cargo, or manual entry.
struct SupplyItemOriginBadge: View {
    let origins: [SupplyItemOrigin]
    var compact = true

    private var accessibilityLabel: String {
        guard !origins.isEmpty else { return "Added manually" }
        return "Source: \(origins.map(\.displayName).joined(separator: " and "))"
    }

    var body: some View {
        if origins.isEmpty {
            EmptyView()
        } else if compact {
            HStack(spacing: 4) {
                ForEach(origins, id: \.self) { origin in
                    Image(systemName: origin.systemImage)
                        .font(.caption2)
                        .foregroundStyle(Theme.hyperGreen)
                        .frame(width: 20, height: 20)
                        .background(Theme.hyperGreen.opacity(0.12))
                        .clipShape(Circle())
                }
            }
            .accessibilityLabel(accessibilityLabel)
        } else {
            HStack(spacing: 6) {
                ForEach(origins, id: \.self) { origin in
                    HStack(spacing: 4) {
                        Image(systemName: origin.systemImage)
                            .font(.caption2)
                        Text(origin.displayName)
                            .font(Typography.caption())
                    }
                    .foregroundStyle(Theme.hyperGreen)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Theme.hyperGreen.opacity(0.12))
                    .clipShape(Capsule())
                }
            }
            .accessibilityLabel(accessibilityLabel)
        }
    }
}
