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
                    UnitPicker(units: RationUnits.all, selection: $unit)
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
    var shareExpiresAt: String?
    var isLoadingShare: Bool = false
    var isSyncing: Bool
    var canManageSupplySettings: Bool
    var supplyWindow: SupplyPlanningWindow?
    var onRefreshFromMeals: () async -> Void
    var onShare: () async -> Void
    var onRevokeShare: () async -> Void
    var onUpgradeRequired: () -> Void
    var onOpenFilters: () -> Void
    var onPatchHorizon: (_ days: Int) async -> Void = { _ in }

    private let horizonPresets = [7, 14, 21, 30]

    var body: some View {
        NavigationStack {
            List {
                Section("Manifest planning") {
                    if let supplyWindow {
                        Text(supplyWindowSummary(supplyWindow))
                            .font(Typography.caption())
                            .foregroundStyle(Theme.muted)
                    }
                    if canManageSupplySettings {
                        Picker("Planning horizon", selection: horizonBinding) {
                            ForEach(horizonPresets, id: \.self) { days in
                                Text("\(days) days").tag(days)
                            }
                        }
                        .pickerStyle(.segmented)
                    } else {
                        Text("Ask a group owner or admin to change the planning horizon.")
                            .font(Typography.caption())
                            .foregroundStyle(Theme.muted)
                    }
                }

                Section("List") {
                    Button {
                        Task { await onRefreshFromMeals() }
                    } label: {
                        Label(isSyncing ? "Refreshing…" : "Refresh list", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .disabled(isSyncing)
                    Button(action: onOpenFilters) {
                        Label("Filters & sort", systemImage: "line.3.horizontal.decrease.circle")
                    }
                }

                ShareLinkSection(
                    shareURL: shareURL,
                    shareExpiresAt: shareExpiresAt,
                    capabilities: [
                        "Viewers can see your supply list",
                        "They can check off items while shopping",
                    ],
                    isLoading: isLoadingShare,
                    onGenerate: onShare,
                    onRevoke: onRevokeShare
                )
            }
            .navigationTitle("Supply options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var horizonBinding: Binding<Int> {
        Binding(
            get: { supplyWindow?.horizonDays ?? 7 },
            set: { newValue in
                guard newValue != supplyWindow?.horizonDays else { return }
                Task {
                    await onPatchHorizon(newValue)
                    await onRefreshFromMeals()
                }
            }
        )
    }

    private func supplyWindowSummary(_ window: SupplyPlanningWindow) -> String {
        let endLabel = HubDateFormat.smartLabel(isoDate: window.endDate)
        return "Including Manifest meals through \(endLabel) (\(window.horizonDays) days)"
    }
}

struct SnoozeDurationSheet: View {
    @Environment(\.dismiss) private var dismiss
    let itemName: String
    var onSelect: (String) async -> Void

    var body: some View {
        NavigationStack {
            List {
                Section("Snooze \(itemName.capitalized)") {
                    snoozeButton("24 hours", duration: "24h")
                    snoozeButton("3 days", duration: "3d")
                    snoozeButton("1 week", duration: "1w")
                }
            }
            .navigationTitle("Snooze item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func snoozeButton(_ label: String, duration: String) -> some View {
        Button(label) {
            Task {
                await onSelect(duration)
                dismiss()
            }
        }
    }
}

struct SnoozedItemsSection: View {
    let snoozes: [SupplySnooze]
    var cargoLinkRows: [CargoLinkResolver.Row] = []
    var onUnsnooze: (SupplySnooze) async -> Void

    @State private var isExpanded = false

    var body: some View {
        if !snoozes.isEmpty {
            Section {
                if isExpanded {
                    ForEach(snoozes) { snooze in
                        HStack {
                            snoozeNameLabel(snooze)
                            Spacer()
                            Button("Unsnooze") {
                                Task { await onUnsnooze(snooze) }
                            }
                            .font(Typography.caption())
                            .foregroundStyle(Theme.hyperGreen)
                        }
                    }
                }
            } header: {
                Button {
                    withAnimation { isExpanded.toggle() }
                } label: {
                    HStack {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        Text("Snoozed (\(snoozes.count))")
                            .rationHeadline()
                        Spacer()
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func snoozeNameLabel(_ snooze: SupplySnooze) -> some View {
        if let cargoId = CargoLinkResolver.resolveCargoId(forName: snooze.displayName, in: cargoLinkRows) {
            NavigationLink {
                CargoDetailView(itemId: cargoId)
            } label: {
                Text(snooze.displayName.capitalized).rationBody()
            }
            .buttonStyle(.plain)
        } else {
            Text(snooze.displayName.capitalized).rationBody()
        }
    }
}

struct CargoRestockQuantitySheet: View {
    @Environment(\.dismiss) private var dismiss
    let item: CargoItem
    var onConfirm: (Double) async -> Void

    @State private var quantity: Double = 1
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                Section(item.name.capitalized) {
                    Stepper(value: $quantity, in: 1...999, step: 1) {
                        Text("Quantity: \(quantity.formatted())")
                    }
                    Text("Unit: \(item.unit)")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }
                Section {
                    Button("Add to Supply") {
                        Task {
                            isSaving = true
                            await onConfirm(quantity)
                            isSaving = false
                            dismiss()
                        }
                    }
                    .disabled(isSaving)
                }
            }
            .navigationTitle("Restock quantity")
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
