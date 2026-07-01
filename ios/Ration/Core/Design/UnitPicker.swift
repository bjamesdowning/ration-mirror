import SwiftUI

/// Curated unit picker — UX guardrail; server `UnitSchema` remains authoritative.
struct UnitPicker: View {
    let units: [String]
    @Binding var selection: String
    var label: String = "Unit"

    var body: some View {
        Picker(label, selection: $selection) {
            ForEach(units, id: \.self) { unit in
                Text(unit).tag(unit)
            }
        }
    }
}
