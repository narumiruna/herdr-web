import Foundation
import Security

protocol CredentialStoring {
    func load() -> String?
    func save(_ token: String) throws
    func clear() throws
}

struct KeychainCredentials: CredentialStoring {
    private let service = "dev.narumiruna.herdrweb.ios"
    private let account = "bridge-token"

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    func load() -> String? {
        var query = query
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func save(_ token: String) throws {
        // Update in place so an insertion failure cannot erase the previous token.
        let data = Data(token.utf8)
        let updated = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw CredentialError.keychain(updated) }
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else { throw CredentialError.keychain(status) }
    }

    func clear() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw CredentialError.keychain(status) }
    }
}

enum CredentialError: LocalizedError {
    case keychain(OSStatus)
    var errorDescription: String? {
        switch self {
        case .keychain(let status): "Could not update the device Keychain (status \(status)). Check device access and try again."
        }
    }
}
