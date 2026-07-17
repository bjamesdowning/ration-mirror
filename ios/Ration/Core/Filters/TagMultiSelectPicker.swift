import SwiftUI

/// Searchable checklist for multi-selecting tags from a large catalog.
/// Selected tags appear as a dismissible chip summary above the list — never the full catalog as chips.
struct TagMultiSelectPicker: View {
    let availableTags: [String]
    @Binding var selectedTags: [String]
    var maxSelection: Int?
    var title: String = "Tags"
    var showsTitle: Bool = true

    @State private var query = ""

    private var filteredTags: [String] {
        TagFilterQuery.filterTags(available: availableTags, query: query)
    }

    private var canAddMore: Bool {
        guard let maxSelection else { return true }
        return selectedTags.count < maxSelection
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header

            if !selectedTags.isEmpty {
                selectedSummary
            }

            TextField("Search tags", text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Theme.platinum)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityLabel("Search tags")

            if let maxSelection {
                Text("\(selectedTags.count)/\(maxSelection) selected")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
            }

            if filteredTags.isEmpty {
                Text(availableTags.isEmpty ? "No tags yet" : "No matching tags")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(filteredTags.enumerated()), id: \.element) { index, tag in
                        tagRow(tag)
                        if index < filteredTags.count - 1 {
                            Divider().opacity(0.4)
                        }
                    }
                }
                .background(Theme.platinum.opacity(0.35))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    @ViewBuilder
    private var header: some View {
        if showsTitle {
            HStack {
                Text(title).rationHeadline()
                Spacer()
                clearTagsButton
            }
        } else {
            clearTagsButton
        }
    }

    @ViewBuilder
    private var clearTagsButton: some View {
        if !selectedTags.isEmpty {
            Button("Clear tags") {
                selectedTags = []
                Haptics.light()
            }
            .font(Typography.caption())
            .foregroundStyle(Theme.hyperGreen)
        }
    }

    private var selectedSummary: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(selectedTags, id: \.self) { tag in
                    DismissibleFilterChip(
                        label: Tag.displayName(from: tag),
                        accessibilityPrefix: "Remove tag"
                    ) {
                        removeTag(tag)
                    }
                }
            }
        }
    }

    private func tagRow(_ tag: String) -> some View {
        let isSelected = selectedTags.contains(tag)
        let isDisabled = !isSelected && !canAddMore

        return Button {
            toggleTag(tag)
        } label: {
            HStack(spacing: 12) {
                Text(Tag.displayName(from: tag))
                    .rationBody()
                    .foregroundStyle(isDisabled ? Theme.muted : Theme.carbon)
                Spacer(minLength: 8)
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(Typography.caption())
                        .foregroundStyle(Theme.hyperGreen)
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityLabel(Tag.displayName(from: tag))
    }

    private func toggleTag(_ tag: String) {
        if selectedTags.contains(tag) {
            selectedTags.removeAll { $0 == tag }
            Haptics.light()
        } else {
            guard canAddMore else { return }
            selectedTags.append(tag)
            Haptics.light()
        }
    }

    private func removeTag(_ tag: String) {
        selectedTags.removeAll { $0 == tag }
    }
}
