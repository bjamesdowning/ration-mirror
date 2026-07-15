import SwiftUI

struct SupplyAddItemSheet: View {
    @Environment(\.dismiss) private var dismiss

    var defaultDomain: String = "food"
    @Binding var serverError: String?
    var onAdd: (CreateSupplyItemRequest) async -> Bool

    @State private var name = ""
    @State private var quantity = "1"
    @State private var unit = "unit"
    @State private var domain: String
    @State private var showDetails = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case name
    }

    init(
        defaultDomain: String = "food",
        serverError: Binding<String?>,
        onAdd: @escaping (CreateSupplyItemRequest) async -> Bool
    ) {
        self.defaultDomain = defaultDomain
        _serverError = serverError
        self.onAdd = onAdd
        _domain = State(initialValue: defaultDomain)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Item") {
                    TextField("Item name", text: $name)
                        .textInputAutocapitalization(.never)
                        .focused($focusedField, equals: .name)

                    Button(showDetails ? "Hide details" : "Add details (qty, domain)") {
                        withAnimation { showDetails.toggle() }
                    }
                    .font(Typography.caption())
                    .foregroundStyle(Theme.hyperGreen)

                    if showDetails {
                        TextField("Quantity", text: $quantity)
                            .keyboardType(.decimalPad)
                        UnitPicker(units: RationUnits.all, selection: $unit)
                        Picker("Domain", selection: $domain) {
                            ForEach(CargoDomain.allCases, id: \.self) { d in
                                Text(d.label).tag(d.rawValue)
                            }
                        }
                    }
                }

                if let message = errorMessage ?? serverError {
                    Section {
                        Text(message)
                            .font(Typography.caption())
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button("Add to Supply") {
                        Task { await submit() }
                    }
                    .disabled(isSaving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .navigationTitle("Add item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear { focusedField = .name }
    }

    private func submit() async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let qty: Double
        if showDetails {
            switch QuantityValidation.validate(quantity) {
            case let .valid(value):
                qty = value
            case let .invalid(message):
                errorMessage = message
                return
            }
        } else {
            qty = 1
        }

        isSaving = true
        errorMessage = nil
        serverError = nil
        defer { isSaving = false }

        let request = CreateSupplyItemRequest(
            name: trimmed,
            quantity: qty,
            unit: showDetails ? unit : "unit",
            domain: showDetails ? domain : defaultDomain
        )
        if await onAdd(request) {
            Haptics.success()
            dismiss()
        } else if errorMessage == nil, serverError == nil {
            errorMessage = "Could not add item. Try again."
        }
    }
}
