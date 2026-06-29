import SwiftUI

struct SupplyItemCheckOffSheet: View {
    @Environment(\.dismiss) private var dismiss
    let item: SupplyItem
    var onConfirm: (Double, String) async -> Void

    @State private var quantity: Double
    @State private var unit: String
    @State private var isSaving = false

    init(item: SupplyItem, onConfirm: @escaping (Double, String) async -> Void) {
        self.item = item
        self.onConfirm = onConfirm
        _quantity = State(initialValue: item.quantity)
        _unit = State(initialValue: item.unit)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(item.name.capitalized) {
                    Stepper(value: $quantity, in: 0...999, step: 0.5) {
                        Text("Quantity: \(quantity.formatted())")
                    }
                    TextField("Unit", text: $unit)
                }
                Section {
                    Button("Mark purchased") {
                        Task {
                            isSaving = true
                            await onConfirm(quantity, unit)
                            isSaving = false
                            dismiss()
                        }
                    }
                    .disabled(isSaving)
                }
            }
            .navigationTitle("Check off item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

struct SupplyOptionsSheet: View {
    @Environment(\.dismiss) private var dismiss
    var shareURL: String?
    var isSyncing: Bool
    var onRefreshFromMeals: () async -> Void
    var onShare: () async -> Void
    var onRevokeShare: () async -> Void
    var onOpenFilters: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section("List") {
                    Button {
                        Task { await onRefreshFromMeals() }
                    } label: {
                        Label(isSyncing ? "Refreshing…" : "Refresh from meals", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .disabled(isSyncing)
                    Button(action: onOpenFilters) {
                        Label("Filters & sort", systemImage: "line.3.horizontal.decrease.circle")
                    }
                }
                Section("Sharing") {
                    if let shareURL, !shareURL.isEmpty {
                        ShareLink(item: shareURL) {
                            Label("Copy share link", systemImage: "link")
                        }
                        Button(role: .destructive) {
                            Task { await onRevokeShare() }
                        } label: {
                            Label("Revoke share link", systemImage: "xmark.circle")
                        }
                    } else {
                        Button {
                            Task { await onShare() }
                        } label: {
                            Label("Share supply list", systemImage: "square.and.arrow.up")
                        }
                    }
                }
            }
            .navigationTitle("Supply options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
