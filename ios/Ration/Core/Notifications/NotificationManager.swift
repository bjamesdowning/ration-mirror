import Foundation
import UserNotifications

/// Opt-in local reminders for expiring cargo and planned meals.
enum NotificationManager {
    static func requestAuthorization() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            return false
        }
    }

    static func scheduleExpirationReminder(itemName: String, fireDate: Date) async {
        let content = UNMutableNotificationContent()
        content.title = "Cargo expiring soon"
        content.body = "\(itemName.capitalized) is nearing its expiration date."
        content.sound = .default

        let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        let request = UNNotificationRequest(
            identifier: "ration.expiry.\(itemName)",
            content: content,
            trigger: trigger
        )
        try? await UNUserNotificationCenter.current().add(request)
    }
}
