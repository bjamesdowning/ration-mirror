import SwiftUI

struct ManifestEntryDetailSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let entry: ManifestPreviewEntry
    var onConsumed: () async -> Void = {}

    @State private var isConsuming = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                if let errorMessage {
                    ErrorBanner(message: errorMessage)
                }
                GlassCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(entry.mealName.capitalized).rationTitle()
                        HubSlotBadge(slotType: entry.slotType)
                        Text(HubDateFormat.smartLabel(isoDate: entry.date)).rationCaption()
                        if let servings = entry.servingsOverride {
                            Text("\(servings) servings").rationCaption()
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                NavigationLink {
                    MealDetailView(mealId: entry.mealId, initialMeal: placeholderMeal)
                } label: {
                    Text("Open in Galley")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle())
                Button {
                    Task { await consume() }
                } label: {
                    Text(isConsuming ? "Consuming…" : "Consume meal")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(AIButtonStyle())
                .disabled(isConsuming || !env.network.isOnline)
                Spacer()
            }
            .padding(16)
            .background(Theme.ceramic)
            .navigationTitle("Planned meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
        }
    }

    private var placeholderMeal: Meal {
        Meal(
            id: entry.mealId,
            organizationId: "",
            name: entry.mealName,
            domain: "food",
            type: entry.mealType ?? "recipe",
            description: nil,
            directions: nil,
            equipment: nil,
            servings: entry.servingsOverride ?? 1,
            prepTime: nil,
            cookTime: nil,
            createdAt: Date(),
            updatedAt: Date(),
            tags: [],
            ingredients: []
        )
    }

    @MainActor
    private func consume() async {
        isConsuming = true
        errorMessage = nil
        defer { isConsuming = false }
        do {
            _ = try await env.api.consumeManifestEntries([entry.entryId])
            Haptics.success()
            await onConsumed()
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
