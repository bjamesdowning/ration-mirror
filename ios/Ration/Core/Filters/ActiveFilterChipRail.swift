import SwiftUI

/// Single-row horizontal rail of *active* filters only (domain + selected tags).
/// Never shows the full tag catalog — use `TagMultiSelectPicker` for discovery.
struct ActiveFilterChipRail: View {
    var domain: CargoDomain?
    var selectedTags: [String] = []
    var onClearDomain: (() -> Void)?
    var onClearTag: ((String) -> Void)?

    private var hasContent: Bool {
        domain != nil || !selectedTags.isEmpty
    }

    var body: some View {
        if hasContent {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    if let domain, let onClearDomain {
                        DismissibleFilterChip(
                            label: domain.label,
                            accessibilityPrefix: "Clear domain"
                        ) {
                            onClearDomain()
                        }
                    }
                    if let onClearTag {
                        ForEach(selectedTags, id: \.self) { tag in
                            DismissibleFilterChip(
                                label: Tag.displayName(from: tag),
                                accessibilityPrefix: "Remove tag"
                            ) {
                                onClearTag(tag)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Active filters")
        }
    }
}
