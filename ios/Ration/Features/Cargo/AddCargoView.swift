import SwiftUI

struct AddCargoView: View {
    let onCreated: () async -> Void

    var body: some View {
        CargoFormView(mode: .create, onSaved: onCreated)
    }
}
