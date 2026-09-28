import Foundation
import Combine

@MainActor
final class WorkbenchStore: ObservableObject {
    @Published private(set) var state: BridgeState?
    @Published private(set) var notice: String?
    @Published private(set) var noticeIsSuccess = false
    @Published private(set) var reconnecting = false
    @Published private(set) var sending: Set<String> = []
    @Published var drafts: [String: String] = [:]

    private(set) var savedURL: String = ""
    private(set) var connectionError: String?
    private(set) var localHTTP = false
    private var client: BridgeServing?
    private var connection: Connection?
    private let credentials: CredentialStoring
    private let defaults: UserDefaults
    private let makeClient: (Connection) -> BridgeServing
    private var syncTask: Task<Void, Never>?
    private var generation = 0

    init(credentials: CredentialStoring = KeychainCredentials(), defaults: UserDefaults = .standard,
         makeClient: @escaping (Connection) -> BridgeServing = { BridgeClient(connection: $0) }) {
        self.credentials = credentials
        self.defaults = defaults
        self.makeClient = makeClient
        savedURL = defaults.string(forKey: "bridgeURL") ?? ""
        localHTTP = defaults.bool(forKey: "localHTTP")
    }

    var connected: Bool { client != nil }
    var role: BridgeState.Role? { state?.access.role }
    var isSending: Bool { !sending.isEmpty }

    func restore() async {
        guard let token = credentials.load(), !savedURL.isEmpty else { return }
        await connect(url: savedURL, token: token, allowLocalHTTP: localHTTP)
    }

    @discardableResult
    func connect(url: String, token: String, allowLocalHTTP: Bool) async -> Bool {
        guard !isSending else {
            connectionError = "Wait for the current prompt result before switching connections."
            notice = connectionError
            noticeIsSuccess = false
            return false
        }
        let proposed: Connection
        do { proposed = try Connection(url, token: token, allowLocalHTTP: allowLocalHTTP) }
        catch {
            connectionError = error.localizedDescription
            notice = connectionError
            noticeIsSuccess = false
            return false
        }
        connectionError = nil
        generation += 1
        let current = generation
        syncTask?.cancel()
        syncTask = nil
        let candidate = makeClient(proposed)
        do {
            let initial = try await candidate.state()
            guard !Task.isCancelled && current == generation else { return false }
            try credentials.save(token)
            defaults.set(proposed.url.absoluteString, forKey: "bridgeURL")
            defaults.set(allowLocalHTTP, forKey: "localHTTP")
            savedURL = proposed.url.absoluteString
            localHTTP = allowLocalHTTP
            if connection != proposed { drafts = [:] }
            connection = proposed
            client = candidate
            state = initial
            connectionError = nil
            notice = nil
            noticeIsSuccess = false
            reconnecting = false
            startSync()
            return true
        } catch {
            if current == generation {
                connectionError = error.localizedDescription
                notice = connectionError
                noticeIsSuccess = false
                if connected { startSync() } // Keep the previous verified connection live.
            }
            return false
        }
    }

    func cancelConnectionAttempt() {
        generation += 1 // Reject a response even if the transport ignores task cancellation.
        connectionError = nil
        if connected { startSync() }
    }

    func disconnect() {
        guard !isSending else { notice = "Wait for the current prompt result before switching connections."; noticeIsSuccess = false; return }
        var removalError: Error?
        do { try credentials.clear() }
        catch { removalError = error }
        generation += 1
        syncTask?.cancel()
        syncTask = nil
        defaults.removeObject(forKey: "bridgeURL")
        defaults.removeObject(forKey: "localHTTP")
        savedURL = ""
        localHTTP = false
        connection = nil
        connectionError = nil
        client = nil
        state = nil
        drafts = [:]
        notice = removalError.map { "Disconnected, but the saved token may remain in Keychain: \($0.localizedDescription)" }
        noticeIsSuccess = false
        reconnecting = false
    }

    func background() {
        generation += 1
        syncTask?.cancel()
        syncTask = nil
        reconnecting = false
    }

    func foreground() { if connected { startSync() } }

    func refresh() async {
        guard let client else { return }
        let current = generation
        do {
            let latest = try await client.state()
            if current == generation { state = latest; notice = nil; noticeIsSuccess = false; reconnecting = false }
        } catch {
            if current == generation {
                notice = error.localizedDescription
                noticeIsSuccess = false
                reconnecting = true
                startSync() // A failed manual refresh must also reconnect a stalled stream.
            }
        }
    }

    func send(to session: Session) async {
        guard session.kind == .agent, role == .controller, !reconnecting,
              session.pane.agent != nil,
              !(session.pane.agentStatus == "blocked" && (state?.snapshot.protocolVersion ?? 0) >= 20),
              let client, !sending.contains(session.id) else { return }
        let originalDraft = drafts[session.id] ?? ""
        let text = originalDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        if let error = Self.promptValidationError(originalDraft) { notice = error; noticeIsSuccess = false; return }
        sending.insert(session.id)
        defer { sending.remove(session.id) }
        do {
            try await client.prompt(paneID: session.id, message: text)
            // Keep edits made while a request was in flight.
            if drafts[session.id] == originalDraft { drafts[session.id] = "" }
            await refresh()
            if !reconnecting { notice = "Prompt accepted."; noticeIsSuccess = true }
        } catch {
            notice = error.localizedDescription
            noticeIsSuccess = false
            // No automatic retry: a timeout or disconnection can occur after the bridge acts.
        }
    }

    static func promptValidationError(_ draft: String) -> String? {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return "Enter a message before sending." }
        if text.count > 20_000 { return "Messages must be at most 20,000 characters." }
        // The bridge rejects JSON bodies over 16,384 bytes, including escaping and the message key.
        if ((try? JSONEncoder().encode(["message": text]).count) ?? Int.max) > 16_384 {
            return "This message exceeds the bridge's 16,384-byte request limit."
        }
        return nil
    }

    private func startSync() {
        generation += 1
        let current = generation
        syncTask?.cancel()
        syncTask = Task { [weak self] in await self?.runSync(generation: current) }
    }

    private func runSync(generation current: Int) async {
        guard let client else { return }
        var attempt = 0
        while !Task.isCancelled && current == generation {
            let started = Date()
            do {
                let latest = try await client.state()
                guard !Task.isCancelled && current == generation else { return }
                state = latest
                notice = nil
                noticeIsSuccess = false
                reconnecting = false
                let events = try await client.events()
                var lastRefresh = Date.distantPast
                var trailingRefresh: Task<Void, Never>?
                defer { trailingRefresh?.cancel() }
                for try await _ in events {
                    guard !Task.isCancelled && current == generation else { return }
                    let remaining = 0.5 - Date().timeIntervalSince(lastRefresh)
                    if remaining > 0 {
                        // Do not lose the final event of a burst that arrives during a read.
                        if trailingRefresh == nil {
                            trailingRefresh = Task {
                                try? await Task.sleep(for: .seconds(remaining))
                                guard !Task.isCancelled && current == generation else { return }
                                await refresh()
                            }
                        }
                        continue
                    }
                    trailingRefresh?.cancel()
                    trailingRefresh = nil
                    lastRefresh = Date()
                    let refreshed = try await client.state()
                    guard !Task.isCancelled && current == generation else { return }
                    state = refreshed
                }
                throw BridgeError.offline
            } catch {
                guard !Task.isCancelled && current == generation else { return }
                notice = error.localizedDescription
                noticeIsSuccess = false
                reconnecting = true
                if Date().timeIntervalSince(started) > 30 { attempt = 0 }
                attempt += 1
                let delay = Self.backoff(attempt: attempt)
                try? await Task.sleep(for: .seconds(delay))
            }
        }
    }

    static func backoff(attempt: Int) -> Int { min(30, 1 << min(max(attempt - 1, 0), 5)) }
}
