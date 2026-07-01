import SwiftUI

/// Tag chips with autocomplete from server tag index.
struct TagChipEditor: View {
    @Binding var tags: [String]
    let suggestions: [String]
    @State private var draft = ""

    private var filteredSuggestions: [String] {
        let needle = draft.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return [] }
        return suggestions
            .filter { $0.localizedCaseInsensitiveContains(needle) && !tags.contains($0) }
            .prefix(6)
            .map { $0 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !tags.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(tags, id: \.self) { tag in
                        HStack(spacing: 4) {
                            Text(tag)
                                .font(Typography.caption())
                            Button {
                                tags.removeAll { $0 == tag }
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.caption2)
                                    .foregroundStyle(Theme.muted)
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.platinum)
                        .clipShape(Capsule())
                    }
                }
            }

            TextField("Add tag", text: $draft)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { commitDraft() }

            if !filteredSuggestions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(filteredSuggestions, id: \.self) { suggestion in
                            Button(suggestion) {
                                addTag(suggestion)
                                draft = ""
                            }
                            .font(Typography.caption())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Theme.hyperGreen.opacity(0.15))
                            .clipShape(Capsule())
                        }
                    }
                }
            }
        }
    }

    private func commitDraft() {
        let tag = draft.trimmingCharacters(in: .whitespaces).lowercased()
        guard !tag.isEmpty else { return }
        addTag(tag)
        draft = ""
    }

    private func addTag(_ tag: String) {
        let normalized = tag.trimmingCharacters(in: .whitespaces).lowercased()
        guard !normalized.isEmpty, !tags.contains(normalized) else { return }
        tags.append(normalized)
    }
}
