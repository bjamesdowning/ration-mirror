import SwiftUI

/// Optional private Eat note (≤280). Shown only when `nutritionIntakeNotes` is on.
struct IntakeNotesField: View {
    @Binding var notes: String
    var maxLength: Int = 280

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Private note (optional)", text: $notes, axis: .vertical)
                .lineLimit(2...4)
                .onChange(of: notes) { _, next in
                    if next.count > maxLength {
                        notes = String(next.prefix(maxLength))
                    }
                }
            Text("\(min(notes.trimmingCharacters(in: .whitespacesAndNewlines).count, maxLength))/\(maxLength)")
                .rationCaption()
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    /// Trimmed payload for API; empty → nil.
    static func payload(from raw: String, maxLength: Int = 280) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return String(trimmed.prefix(maxLength))
    }
}
