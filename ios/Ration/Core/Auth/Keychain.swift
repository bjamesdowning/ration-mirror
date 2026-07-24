import Foundation
import Security

/// Minimal Keychain wrapper (no third-party dependency).
/// Tokens are stored with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
/// so they survive relaunch but never sync off-device.
enum Keychain {
    private static let service = "com.mayutic.ration.auth"
    /// Simulator / XCTest hosts without keychain entitlements.
    private static let missingEntitlement: OSStatus = -34018

    enum Status: Equatable {
        case success
        case failure(OSStatus)

        static func map(_ status: OSStatus) -> Status {
            status == errSecSuccess ? .success : .failure(status)
        }
    }

    @discardableResult
    static func set(_ value: String, for key: String) -> Bool {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        let deleteStatus = SecItemDelete(query as CFDictionary)
        #if DEBUG
        if deleteStatus != errSecSuccess,
           deleteStatus != errSecItemNotFound,
           deleteStatus != missingEntitlement
        {
            assertionFailure("Keychain delete failed: \(deleteStatus)")
        }
        #endif

        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(add as CFDictionary, nil)
        #if DEBUG
        if addStatus != errSecSuccess, addStatus != missingEntitlement {
            assertionFailure("Keychain add failed: \(addStatus)")
        }
        #endif
        // XCTest / missing-entitlement hosts (DEBUG only): soft-succeed so auth
        // unit tests can exercise token flow without a keychain entitlement.
        // Release must fail closed — never treat missing entitlement as success.
        #if DEBUG
        if addStatus == missingEntitlement { return true }
        #endif
        return Status.map(addStatus) == .success
    }

    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8)
        else { return nil }
        return value
    }

    @discardableResult
    static func delete(_ key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            return true
        }
        #if DEBUG
        if status == missingEntitlement { return true }
        #endif
        return false
    }
}
