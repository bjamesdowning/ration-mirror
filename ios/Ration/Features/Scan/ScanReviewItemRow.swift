import SwiftUI

struct ScanReviewItemRow: View {
    let item: EditableScanResultItem
    let isEditing: Bool
    let onToggleSelection: () -> Void
    let onStartEdit: () -> Void
    let onSave: (String, String, String) -> String?
    let onCancelEdit: () -> Void

    @State private var draftName = ""
    @State private var draftQuantity = ""
    @State private var draftUnit = ""
    @State private var validationError: String?
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case name, quantity
    }

    var body: some View {
        GlassCard {
            if isEditing {
                editContent
            } else {
                collapsedContent
            }
        }
        .onChange(of: isEditing) { _, editing in
            if editing {
                populateDraft()
            }
        }
        .onAppear {
            if isEditing {
                populateDraft()
            }
        }
    }

    private func populateDraft() {
        draftName = item.name
        draftQuantity = EditableScanResultItem.formatQuantity(item.quantity)
        draftUnit = item.unit
        validationError = nil
    }

    private var collapsedContent: some View {
        HStack(alignment: .top, spacing: 12) {
            Button(action: onToggleSelection) {
                Image(systemName: item.selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(item.selected ? Theme.hyperGreen : Theme.muted)
                    .font(.title3)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.selected ? "Deselect item" : "Select item")

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(item.name.capitalized)
                        .rationBody()
                    if item.isLowConfidence {
                        Label("Verify", systemImage: "exclamationmark.triangle.fill")
                            .font(Typography.caption())
                            .foregroundStyle(.orange)
                            .labelStyle(.titleAndIcon)
                    }
                }
                if let domain = item.domain {
                    Text(domain.capitalized)
                        .rationCaption()
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            DisplayQuantityLabel(
                quantity: item.quantity,
                unit: item.unit,
                ingredientName: item.name
            )
            .rationCaption()

            Button(action: onStartEdit) {
                Image(systemName: "pencil")
                    .foregroundStyle(Theme.muted)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Edit item")
        }
    }

    private var editContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Item name", text: $draftName)
                .textInputAutocapitalization(.never)
                .focused($focusedField, equals: .name)

            HStack(spacing: 12) {
                TextField("Qty", text: $draftQuantity)
                    .keyboardType(.decimalPad)
                    .focused($focusedField, equals: .quantity)
                    .frame(maxWidth: 80)
                UnitPicker(units: RationUnits.cargoEdit, selection: $draftUnit)
            }

            if let validationError {
                Text(validationError)
                    .font(Typography.caption())
                    .foregroundStyle(.red)
            }

            HStack {
                Button("Cancel", action: onCancelEdit)
                    .buttonStyle(SecondaryButtonStyle())
                Button("Save") {
                    if let error = onSave(draftName, draftQuantity, draftUnit) {
                        validationError = error
                    } else {
                        validationError = nil
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .rationFormKeyboardToolbar { focusedField = nil }
    }
}
