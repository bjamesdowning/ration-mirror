import SwiftUI

/// Meal-plan slot icons — mirrors web manifest slot symbology.
enum SlotGlyph {
    static func systemImage(for slotType: String) -> String {
        switch slotType.lowercased() {
        case "breakfast": return "sunrise.fill"
        case "lunch": return "sun.max.fill"
        case "dinner": return "moon.fill"
        case "snack": return "carrot.fill"
        default: return "fork.knife"
        }
    }
}

struct SlotGlyphView: View {
    let slotType: String

    var body: some View {
        Image(systemName: SlotGlyph.systemImage(for: slotType))
            .font(Typography.mono(14, weight: .semibold))
            .foregroundStyle(Theme.muted)
            .frame(width: 28, height: 28)
            .background(Theme.platinum)
            .clipShape(Circle())
            .accessibilityLabel(slotType.capitalized)
    }
}
