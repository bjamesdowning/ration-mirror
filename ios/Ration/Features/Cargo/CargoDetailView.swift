import SwiftUI
import Observation

@MainActor
@Observable
final class CargoDetailViewModel {
    private(set) var item: CargoItem?
    private(set) var connectedMeals: [ConnectedCargoMeal] = []
    private(set) var isLoading = false
    private(set) var isSelectedForRestock = false
    private(set) var isTogglingRestock = false
    var errorMessage: String?

    func load(id: String, api: RationAPI) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let detailTask = api.cargoItem(id: id)
            async let activeTask = api.cargo(cursor: nil, limit: 1)
            let response = try await detailTask
            let activePage = try await activeTask
            item = response.item
            connectedMeals = response.connectedMeals ?? []
            isSelectedForRestock = activePage.activeCargoIds?.contains(id) ?? false
        } catch {
            item = nil
            connectedMeals = []
            isSelectedForRestock = false
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func toggleRestock(quantity: Double? = nil, api: RationAPI) async {
        guard let item else { return }
        let activating = !isSelectedForRestock
        isTogglingRestock = true
        if activating {
            isSelectedForRestock = true
        } else {
            isSelectedForRestock = false
        }
        defer { isTogglingRestock = false }
        do {
            let response = try await api.toggleCargoRestock(id: item.id, quantity: quantity)
            isSelectedForRestock = response.isActive
            Haptics.light()
        } catch {
            isSelectedForRestock = !activating
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
    @Environment(CopilotScrollContext.self) private var scrollContext
    @Environment(\.dismiss) private var dismiss
    let itemId: String
    @State private var model = CargoDetailViewModel()
    @State private var showingEdit = false
    @State private var showingDeleteConfirm = false
    @State private var showingRestockQuantity = false
    @State private var connectedMealsSort: ConnectedMealsSort = .alphabetical
    @State private var expandedMealIds: Set<String> = []
    @State private var showAllConnectedMeals = false

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
                        connectedMealsSection(cargoItem: item)
                    }
                    .padding(16)
                }
                .scrollDismissesKeyboard(.interactively)
                .copilotDockScrollMargins()
                .copilotScrollTracked(tab: scrollContext.activeTab, isActive: true)
            } else {
                cargoLoadFailureView
            }
        }
        .background(Theme.ceramic)
        .navigationTitle(model.item?.name.capitalized ?? "Cargo")
        .navigationBarTitleDisplayMode(.inline)
        .tabDockAction(tag: scrollContext.activeTab, isActive: model.item != nil) {
            IconFABMenuCore(systemImage: "ellipsis.circle.fill", accessibilityLabel: "Cargo actions") {
                Button {
                    Task { await handleSupplyToggle() }
                } label: {
                    Label(
                        model.isSelectedForRestock ? "Remove from Supply" : "Add to Supply",
                        systemImage: model.isSelectedForRestock ? "cart.fill.badge.minus" : "cart.badge.plus"
                    )
                }
                .disabled(model.isTogglingRestock || !env.network.isOnline)
                Button { showingEdit = true } label: {
                    Label("Edit", systemImage: "pencil")
                }
                Button(role: .destructive) { showingDeleteConfirm = true } label: {
                    Label("Delete", systemImage: "trash")
                }
                .destructiveDeleteTint()
            }
        }
        .onChange(of: model.isSelectedForRestock) { _, _ in
            env.tabDock.bumpContentEpoch()
        }
        .onChange(of: model.isTogglingRestock) { _, _ in
            env.tabDock.bumpContentEpoch()
        }
        .task { await model.load(id: itemId, api: env.api) }
        .sheet(isPresented: $showingEdit) {
            if let item = model.item {
                CargoFormView(mode: .edit(item)) {
                    await model.load(id: itemId, api: env.api)
                }
            }
        }
        .sheet(isPresented: $showingRestockQuantity) {
            if let item = model.item {
                CargoRestockQuantitySheet(item: item) { quantity in
                    await model.toggleRestock(quantity: quantity, api: env.api)
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

    private func handleSupplyToggle() async {
        if model.isSelectedForRestock {
            await model.toggleRestock(api: env.api)
        } else {
            showingRestockQuantity = true
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
                    DisplayQuantityLabel(
                        quantity: item.quantity,
                        unit: item.unit,
                        baseQuantity: item.baseQuantity,
                        baseUnit: item.baseUnit,
                        ingredientName: item.name
                    )
                    .rationHeadline()
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

    private func tagsSection(_ tags: [Tag]) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Tags").rationHeadline()
                FlowLayout(spacing: 8) {
                    ForEach(tags) { tag in
                        Text(tag.name)
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

    private func connectedMealsSection(cargoItem: CargoItem) -> some View {
        let sorted = ConnectedMealsPresentation.sort(model.connectedMeals, by: connectedMealsSort)
        let visible = showAllConnectedMeals ? sorted : Array(sorted.prefix(5))
        let hiddenCount = max(0, sorted.count - 5)

        return GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Theme.hyperGreen)
                            .frame(width: 8, height: 8)
                        Text("Connected meals")
                            .rationHeadline()
                    }
                    Spacer()
                    Text(ListCountLabel.format(sorted.count))
                        .rationCaption()
                }

                if sorted.isEmpty {
                    Text("No meals use this ingredient yet.")
                        .rationBody()
                        .foregroundStyle(Theme.muted)
                } else {
                    Menu {
                        Picker("Sort", selection: $connectedMealsSort) {
                            Text("Alphabetical").tag(ConnectedMealsSort.alphabetical)
                            Text("Quantity needed").tag(ConnectedMealsSort.quantityNeeded)
                            Text("Connection type").tag(ConnectedMealsSort.connectionType)
                        }
                    } label: {
                        Label("Sort", systemImage: "arrow.up.arrow.down")
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                    }

                    ForEach(visible) { meal in
                        connectedMealCard(
                            meal,
                            onHand: cargoItem.quantity,
                            onHandUnit: cargoItem.unit
                        )
                    }

                    if hiddenCount > 0 && !showAllConnectedMeals {
                        Button("Show \(hiddenCount) more") {
                            showAllConnectedMeals = true
                        }
                        .font(Typography.caption())
                        .foregroundStyle(Theme.hyperGreen)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func connectedMealCard(
        _ meal: ConnectedCargoMeal,
        onHand: Double,
        onHandUnit: String
    ) -> some View {
        let isExpanded = expandedMealIds.contains(meal.id) || meal.connectedIngredients.count <= 2

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                NavigationLink {
                    MealDetailView(mealId: meal.id, initialMeal: placeholderMeal(from: meal))
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(meal.name.capitalized).rationBody()
                        if let description = meal.description, !description.isEmpty, isExpanded {
                            Text(description).rationCaption()
                        }
                    }
                }
                .buttonStyle(.plain)
                Spacer()
                if meal.connectedIngredients.count > 2 {
                    Button {
                        if expandedMealIds.contains(meal.id) {
                            expandedMealIds.remove(meal.id)
                        } else {
                            expandedMealIds.insert(meal.id)
                        }
                    } label: {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(Typography.caption())
                            .foregroundStyle(Theme.muted)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(isExpanded ? "Collapse ingredients" : "Expand ingredients")
                }
            }

            if !meal.tags.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(meal.tags, id: \.self) { tag in
                        Text(tag)
                            .rationCaption()
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Theme.platinum)
                            .clipShape(Capsule())
                    }
                }
            }

            if isExpanded {
                ForEach(meal.connectedIngredients) { ingredient in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(ingredient.ingredientName.capitalized)
                                .rationBody()
                            Spacer()
                            Text(ConnectedMealsPresentation.coverageLabel(
                                needed: ingredient.quantity,
                                onHand: onHand,
                                unit: ingredient.unit,
                                onHandUnit: onHandUnit,
                                ingredientName: ingredient.ingredientName,
                                mode: env.unitDisplayMode.mode
                            ))
                            .rationCaption()
                            .multilineTextAlignment(.trailing)
                        }
                        Text(ConnectedMealsPresentation.connectionTypeLabel(ingredient.connectionType))
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(10)
                    .background(Theme.platinum.opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func placeholderMeal(from connected: ConnectedCargoMeal) -> Meal {
        Meal(
            id: connected.id,
            organizationId: "",
            name: connected.name,
            domain: "food",
            type: connected.type,
            description: connected.description,
            directions: nil,
            equipment: nil,
            servings: 1,
            prepTime: nil,
            cookTime: nil,
            createdAt: Date(),
            updatedAt: Date(),
            tags: connected.tags.map { Tag(slug: $0) },
            ingredients: connected.connectedIngredients.map {
                MealIngredient(
                    id: $0.id,
                    mealId: $0.mealId,
                    cargoId: nil,
                    resolvedCargoId: nil,
                    ingredientName: $0.ingredientName,
                    quantity: $0.quantity,
                    unit: $0.unit,
                    baseQuantity: nil,
                    baseUnit: nil,
                    isOptional: $0.isOptional ?? false,
                    orderIndex: $0.orderIndex ?? 0
                )
            }
        )
    }
}
