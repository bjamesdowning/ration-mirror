import SwiftUI
import Observation

@MainActor
@Observable
final class CargoDetailViewModel {
    private(set) var item: CargoItem?
    private(set) var connectedMeals: [ConnectedCargoMeal] = []
    private(set) var isLoading = false
    var errorMessage: String?

    func load(id: String, api: RationAPI) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response = try await api.cargoItem(id: id)
            item = response.item
            connectedMeals = response.connectedMeals ?? []
        } catch {
            item = nil
            connectedMeals = []
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func delete(api: RationAPI) async -> Bool {
        guard let item else { return false }
        do {
            try await api.deleteCargo(item.id)
            Haptics.light()
            return true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }
}

struct CargoDetailView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let itemId: String
    @State private var model = CargoDetailViewModel()
    @State private var showingEdit = false
    @State private var showingDeleteConfirm = false

    var body: some View {
        Group {
            if model.isLoading && model.item == nil {
                LoadingView()
            } else if let item = model.item {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if let errorMessage = model.errorMessage {
                            ErrorBanner(message: errorMessage)
                        }
                        header(item)
                        if !item.tags.isEmpty {
                            tagsSection(item.tags)
                        }
                        if !model.connectedMeals.isEmpty {
                            connectedMealsSection
                        }
                    }
                    .padding(16)
                }
            } else {
                cargoLoadFailureView
            }
        }
        .background(Theme.ceramic)
        .navigationTitle(model.item?.name.capitalized ?? "Cargo")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if model.item != nil {
                DetailActionFAB(
                    systemImage: "ellipsis.circle.fill",
                    accessibilityLabel: "Cargo actions"
                ) {
                    Button { showingEdit = true } label: {
                        Label("Edit", systemImage: "pencil")
                    }
                    Button(role: .destructive) { showingDeleteConfirm = true } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .task { await model.load(id: itemId, api: env.api) }
        .sheet(isPresented: $showingEdit) {
            if let item = model.item {
                NavigationStack {
                    CargoEditSheet(item: item) {
                        await model.load(id: itemId, api: env.api)
                    }
                }
            }
        }
        .confirmationDialog("Delete this cargo item?", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    if await model.delete(api: env.api) { dismiss() }
                }
            }
        }
    }

    private var cargoLoadFailureView: some View {
        VStack(spacing: 16) {
            EmptyStateView(
                icon: "shippingbox",
                title: "Couldn't load item",
                message: model.errorMessage ?? "This item may have been deleted or is unavailable."
            )
            Button("Retry") {
                Task { await model.load(id: itemId, api: env.api) }
            }
            .buttonStyle(SecondaryButtonStyle())
        }
        .padding(24)
    }

    private func header(_ item: CargoItem) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text(item.name.capitalized).rationTitle()
                HStack {
                    Text(item.domain.capitalized).rationCaption()
                    Spacer()
                    Text("\(item.quantity.formatted()) \(item.unit)").rationHeadline()
                }
                statusRow(item)
                if let expires = item.expiresAt {
                    Text("Expires \(expires.formatted(date: .abbreviated, time: .omitted))")
                        .rationCaption()
                        .foregroundStyle(item.status == "expired" ? Theme.danger : Theme.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func statusRow(_ item: CargoItem) -> some View {
        HStack(spacing: 8) {
            Circle()
                .fill(statusColor(item.status))
                .frame(width: 8, height: 8)
            Text(item.status.capitalized).rationCaption()
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "fresh": Theme.hyperGreen
        case "expiring": Theme.warning
        case "expired": Theme.danger
        default: Theme.muted
        }
    }

    private func tagsSection(_ tags: [String]) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Tags").rationHeadline()
                FlowLayout(spacing: 8) {
                    ForEach(tags, id: \.self) { tag in
                        Text(tag)
                            .rationCaption()
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Theme.platinum)
                            .clipShape(Capsule())
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var connectedMealsSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Connected meals").rationHeadline()
                ForEach(model.connectedMeals) { meal in
                    NavigationLink {
                        MealDetailView(mealId: meal.id, initialMeal: placeholderMeal(from: meal))
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(meal.name.capitalized).rationBody()
                            if let first = meal.connectedIngredients.first {
                                Text("\(first.quantity.formatted()) \(first.unit) needed")
                                    .rationCaption()
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }

    private func placeholderMeal(from connected: ConnectedCargoMeal) -> Meal {
        Meal(
            id: connected.id,
            organizationId: "",
            name: connected.name,
            domain: "food",
            type: connected.type,
            description: nil,
            directions: nil,
            equipment: nil,
            servings: 1,
            prepTime: nil,
            cookTime: nil,
            createdAt: Date(),
            updatedAt: Date(),
            tags: connected.tags,
            ingredients: connected.connectedIngredients.map {
                MealIngredient(
                    id: $0.id,
                    mealId: $0.mealId,
                    cargoId: nil,
                    ingredientName: $0.ingredientName,
                    quantity: $0.quantity,
                    unit: $0.unit,
                    isOptional: false,
                    orderIndex: 0
                )
            }
        )
    }
}

@MainActor
@Observable
final class CargoEditViewModel {
    var name = ""
    var domain = "food"
    var quantity = ""
    var unit = ""
    var tags: [String] = []
    var expiresAt: Date?
    private(set) var isSaving = false
    var errorMessage: String?

    init(item: CargoItem) {
        name = item.name
        domain = item.domain
        quantity = String(item.quantity)
        unit = item.unit
        tags = item.tags
        expiresAt = item.expiresAt
    }

    func save(itemId: String, api: RationAPI) async -> Bool {
        guard let qty = Double(quantity) else {
            errorMessage = "Quantity must be a number."
            return false
        }
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await api.updateCargo(
                id: itemId,
                UpdateCargoRequest(
                    name: name,
                    quantity: qty,
                    unit: unit,
                    domain: domain,
                    tags: tags,
                    expiresAt: expiresAt
                )
            )
            Haptics.light()
            return true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }
}

struct CargoEditSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let item: CargoItem
    var onSaved: () async -> Void = {}
    @State private var model: CargoEditViewModel
    @State private var tagSuggestions: [String] = []

    init(item: CargoItem, onSaved: @escaping () async -> Void = {}) {
        self.item = item
        self.onSaved = onSaved
        _model = State(initialValue: CargoEditViewModel(item: item))
    }

    var body: some View {
        Form {
            Section("Item") {
                TextField("Name", text: $model.name)
                Picker("Domain", selection: $model.domain) {
                    Text("Food").tag("food")
                    Text("Household").tag("household")
                    Text("Alcohol").tag("alcohol")
                }
                TextField("Quantity", text: $model.quantity)
                    .keyboardType(.decimalPad)
                UnitPicker(units: RationUnits.cargoEdit, selection: $model.unit)
                TagChipEditor(tags: $model.tags, suggestions: tagSuggestions)
                Toggle("Set expiry date", isOn: Binding(
                    get: { model.expiresAt != nil },
                    set: { model.expiresAt = $0 ? (model.expiresAt ?? Date()) : nil }
                ))
                if model.expiresAt != nil {
                    DatePicker(
                        "Expires",
                        selection: Binding(
                            get: { model.expiresAt ?? Date() },
                            set: { model.expiresAt = $0 }
                        ),
                        displayedComponents: .date
                    )
                }
            }
            if let errorMessage = model.errorMessage {
                Section { ErrorBanner(message: errorMessage) }
            }
            Section {
                Button("Save changes") {
                    Task {
                        if await model.save(itemId: item.id, api: env.api) {
                            await onSaved()
                            dismiss()
                        }
                    }
                }
                .disabled(model.isSaving)
            }
        }
        .navigationTitle("Edit Cargo")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let response = try? await env.api.cargoTags() {
                tagSuggestions = response.tags
            }
        }
    }
}
