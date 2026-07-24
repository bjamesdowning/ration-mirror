import Foundation
import Observation

@MainActor
@Observable
final class AddManifestEntryViewModel {
    private(set) var meals: [Meal] = []
    private(set) var isLoadingMeals = false
    var selectedMealId: String?
    var date: Date = Date()
    var slotType = "dinner"
    var errorMessage: String?

    func loadMeals(api: RationAPI) async {
        isLoadingMeals = true
        defer { isLoadingMeals = false }
        do {
            meals = try await api.meals(limit: 100).meals
            if selectedMealId == nil {
                selectedMealId = meals.first?.id
            }
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func isoDate() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return f.string(from: date)
    }
}
