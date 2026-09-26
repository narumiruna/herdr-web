import Foundation
import Combine

@MainActor
final class WorkbenchStore: ObservableObject {
    @Published private(set) var state: BridgeState?
    @Published private(set) var notice: String?
    @Published private(set) var reconnecting = false
    @Published private(set) var sending: Set<String> = []
    @Published var drafts: [String: String] = [:]

    private(set) var savedURL: String = ""
    private(set) var localHTTP = false
    private var client: BridgeServing?
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

    func connect(url: String, token: String, allowLocalHTTP: Bool) async {
        guard !isSending else { notice = "Wait for the current prompt result before switching connections."; return }
        let proposed: Connection
        do { proposed = try Connection(url, token: token, allowLocalHTTP: allowLocalHTTP) }
        catch { notice = error.localizedDescription; return }
        generation += 1
        let current = generation
        syncTask?.cancel()
        syncTask = nil
        let candidate = makeClient(proposed)
        do {
            let initial = try await candidate.state()
            guard current == generation else { return }
            try credentials.save(token)
            defaults.set(proposed.url.absoluteString, forKey: "bridgeURL")
            defaults.set(allowLocalHTTP, forKey: "localHTTP")
            savedURL = proposed.url.absoluteString
            localHTTP = allowLocalHTTP
            client = candidate
            drafts = [:]
            state = initial
            notice = nil
            startSync()
        } catch {
            if current == generation {
                notice = error.localizedDescription
                if connected { startSync() } // Keep the previous verified connection live.
            }
        }
    }

    func disconnect() {
        guard !isSending else { notice = "Wait for the current prompt result before switching connections."; return }
        do { try credentials.clear() }
        catch { notice = error.localizedDescription; return }
        generation += 1
        syncTask?.cancel()
        syncTask = nil
        defaults.removeObject(forKey: "bridgeURL")
        defaults.removeObject(forKey: "localHTTP")
        savedURL = ""
        localHTTP = false
        client = nil
        state = nil
        drafts = [:]
        notice = nil
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
            if current == generation { state = latest; notice = nil }
        } catch {
            if current == generation {
                notice = error.localizedDescription
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
        let text = (drafts[session.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { notice = "Enter a message before sending."; return }
        guard text.count <= 20_000 else { notice = "Messages must be at most 20,000 characters."; return }
        sending.insert(session.id)
        defer { sending.remove(session.id) }
        do {
            try await client.prompt(paneID: session.id, message: text)
            // Keep edits made while a request was in flight.
            if drafts[session.id] == text { drafts[session.id] = "" }
            await refresh()
            if !reconnecting { notice = "Prompt accepted." }
        } catch {
            notice = error.localizedDescription
            // No automatic retry: a timeout or disconnection can occur after the bridge acts.
        }
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
