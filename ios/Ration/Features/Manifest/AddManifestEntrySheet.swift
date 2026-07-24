import SwiftUI
import Observation

private let manifestSlots = ["breakfast", "lunch", "dinner", "snack"]

struct AddManifestEntrySheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppEnvironment.self) private var env
    @State private var model = AddManifestEntryViewModel()
    let defaultDate: String?
    let onSave: (String, String, String) async -> String?

    var body: some View {
        NavigationStack {
            Form {
                if model.isLoadingMeals {
                    Section {
                        ProgressView().tint(Theme.hyperGreen)
                    }
                } else if model.meals.isEmpty {
                    Section {
                        Text("Add meals in Galley first, then schedule them here.")
                            .rationCaption()
                    }
                } else {
                    Section("Meal") {
                        Picker("Meal", selection: $model.selectedMealId) {
                            ForEach(model.meals) { meal in
                                Text(meal.name.capitalized).tag(Optional(meal.id))
                            }
                        }
                    }
                    Section("When") {
                        DatePicker("Date", selection: $model.date, displayedComponents: .date)
                        Picker("Slot", selection: $model.slotType) {
                            ForEach(manifestSlots, id: \.self) { slot in
                                Text(slot.capitalized).tag(slot)
                            }
                        }
                    }
                }

                if let errorMessage = model.errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage)
                    }
                }
            }
            .navigationTitle("Add to plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { Task { await save() } }
                        .disabled(model.selectedMealId == nil || model.meals.isEmpty)
                }
            }
            .task {
                if let defaultDate, let parsed = Self.parseISODate(defaultDate) {
                    model.date = parsed
                }
                await model.loadMeals(api: env.api)
            }
        }
    }

    @MainActor
    private func save() async {
        guard let mealId = model.selectedMealId else { return }
        if let error = await onSave(mealId, model.isoDate(), model.slotType) {
            model.errorMessage = error
        } else {
            dismiss()
        }
    }

    private static func parseISODate(_ raw: String) -> Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return f.date(from: raw)
    }
}
