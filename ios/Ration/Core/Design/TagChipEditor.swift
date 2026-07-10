import SwiftUI

/// Tag chips with autocomplete from server tag index.
struct TagChipEditor: View {
    @Binding var tags: [String]
    let suggestions: [String]
    var maxTags: Int = 10
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
                            Text(Tag.displayName(from: tag))
                                .font(Typography.caption())
                            Button {
                                tags.removeAll { $0 == tag }
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.caption2)
                                    .foregroundStyle(Theme.muted)
                            }
                            .buttonStyle(.plain)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                            .accessibilityLabel("Remove tag \(Tag.displayName(from: tag))")
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.platinum)
                        .clipShape(Capsule())
                    }
                }
            }

            if tags.count < maxTags {
                TextField("Add tag", text: $draft)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit { commitDraft() }
            }

            if !filteredSuggestions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(filteredSuggestions, id: \.self) { suggestion in
                            Button(Tag.displayName(from: suggestion)) {
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

            Text("\(tags.count)/\(maxTags) tags")
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
        }
    }

    private func commitDraft() {
        let tag = normalize(draft)
        guard !tag.isEmpty else { return }
        addTag(tag)
        draft = ""
    }

    private func addTag(_ tag: String) {
        let normalized = normalize(tag)
        guard !normalized.isEmpty, !tags.contains(normalized), tags.count < maxTags else { return }
        tags.append(normalized)
    }

    private func normalize(_ raw: String) -> String {
        raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
            .filter { $0.isLetter || $0.isNumber || $0 == "-" }
    }
}
