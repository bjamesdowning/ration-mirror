import SwiftUI

enum TagPalette {
    static let colors: [String] = [
        "#00E088",
        "#3B82F6",
        "#F59E0B",
        "#EF4444",
        "#8B5CF6",
        "#EC4899",
        "#14B8A6",
        "#64748B",
    ]

    /// Background opacity matching web `TagChip` (`${hex}20` ≈ 12.5%).
    static let chipBackgroundOpacity: Double = 0.125

    static func swiftUIColor(from hex: String?) -> Color {
        guard let hex, let value = parseHexColor(hex) else {
            return Theme.hyperGreen
        }
        return Color(hex: value)
    }

    /// Foreground for list/detail tag chips; nil/invalid → Hyper-Green.
    static func chipForeground(from hex: String?) -> Color {
        swiftUIColor(from: hex)
    }

    /// Tinted chip background; nil/invalid → theme default Hyper-Green wash.
    static func chipBackground(from hex: String?) -> Color {
        guard let hex, parseHexColor(hex) != nil else {
            return Theme.tagChipBackground
        }
        return swiftUIColor(from: hex).opacity(chipBackgroundOpacity)
    }

    static func parseHexColor(_ hex: String) -> UInt32? {
        let cleaned = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard cleaned.count == 6, let value = UInt32(cleaned, radix: 16) else { return nil }
        return value
    }

    static func sanitizedColor(_ color: String?) -> String? {
        guard let color else { return nil }
        let normalized = color.uppercased()
        return colors.first { $0.uppercased() == normalized }
    }
}

struct TagColorDot: View {
    let color: String?

    var body: some View {
        Circle()
            .fill(TagPalette.swiftUIColor(from: color))
            .frame(width: 10, height: 10)
    }
}

struct TagColorPicker: View {
    @Binding var selection: String?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                colorButton(hex: nil, fill: Theme.hyperGreen.opacity(0.15), label: "Default color")

                ForEach(TagPalette.colors, id: \.self) { hex in
                    colorButton(hex: hex, fill: TagPalette.swiftUIColor(from: hex), label: "Color \(hex)")
                }
            }
        }
    }

    private func colorButton(hex: String?, fill: Color, label: String) -> some View {
        Button {
            selection = hex
        } label: {
            Circle()
                .fill(fill)
                .frame(width: 28, height: 28)
                .overlay {
                    Circle()
                        .stroke(selection == hex ? Theme.carbon : Color.clear, lineWidth: 2)
                }
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(label)
    }
}
