import SwiftUI

struct AddMealSheet: View {
    var onSaved: () async -> Void = {}

    var body: some View {
        MealFormView(mode: .create, onSaved: onSaved)
    }
}
