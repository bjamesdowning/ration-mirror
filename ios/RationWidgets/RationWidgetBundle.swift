import SwiftUI
import WidgetKit

@main
struct RationWidgetBundle: WidgetBundle {
    var body: some Widget {
        SupplyHomeWidget()
        EatHomeWidget()
        TodayHomeWidget()
    }
}
