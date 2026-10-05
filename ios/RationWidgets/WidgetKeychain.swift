import Foundation
import Security

/// Keychain access shared with the host app's default access group.
/// The host does not set `kSecAttrAccessGroup`; its items live in this group.
enum WidgetKeychain {
    static let accessGroup = "M2KJH5GDGH.com.mayutic.ration"
    private static let service = "com.mayutic.ration.auth"

    @discardableResult
    static func set(_ value: String, for key: String) -> Bool {
        let query = base(key)
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    static func get(_ key: String) -> String? {
        var query = base(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func base(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: accessGroup,
        ]
    }
}
