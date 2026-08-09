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
    /// When set, loadMeals prefers this id over meals.first.
    var preselectedMealId: String?

    func loadMeals(api: RationAPI) async {
        isLoadingMeals = true
        defer { isLoadingMeals = false }
        do {
            meals = try await api.meals(limit: 100).meals
            if let preselectedMealId,
               meals.contains(where: { $0.id == preselectedMealId })
            {
                selectedMealId = preselectedMealId
            } else if selectedMealId == nil {
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

    static func inferSlotType(from date: Date = Date()) -> String {
        let hour = Calendar.current.component(.hour, from: date)
        if hour >= 5 && hour < 10 { return "breakfast" }
        if hour >= 10 && hour < 15 { return "lunch" }
        if hour >= 15 && hour < 21 { return "dinner" }
        return "snack"
    }
}
