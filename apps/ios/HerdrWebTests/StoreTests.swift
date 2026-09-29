import XCTest
@testable import HerdrWeb

private final class MemoryCredentials: CredentialStoring {
    var token: String?
    var clearError: Error?
    func load() -> String? { token }
    func save(_ token: String) throws { self.token = token }
    func clear() throws {
        if let clearError { throw clearError }
        token = nil
    }
}

private final class FakeBridge: BridgeServing {
    var stateResult: Result<BridgeState, Error>
    var stateHandler: (() async throws -> BridgeState)?
    var promptResult: Result<Void, Error> = .success(())
    var promptHandler: (() async throws -> Void)?
    var prompts: [(String, String)] = []
    var continuation: AsyncThrowingStream<Void, Error>.Continuation?
    var stateCalls = 0
    init(_ state: BridgeState) { stateResult = .success(state) }
    func state() async throws -> BridgeState {
        stateCalls += 1
        if let stateHandler { return try await stateHandler() }
        return try stateResult.get()
    }
    func events() async throws -> AsyncThrowingStream<Void, Error> {
        AsyncThrowingStream { self.continuation = $0 }
    }
    func prompt(paneID: String, message: String) async throws {
        prompts.append((paneID, message))
        if let promptHandler { try await promptHandler() }
        else { try promptResult.get() }
    }
}

@MainActor
final class StoreTests: XCTestCase {
    private func state(role: String = "controller") throws -> BridgeState {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "state", withExtension: "json"))
        let text = try String(contentsOf: url).replacingOccurrences(of: "\"controller\"", with: "\"\(role)\"")
        return try JSONDecoder().decode(BridgeState.self, from: Data(text.utf8))
    }

    private func setup(_ bridge: FakeBridge, safetyRefreshInterval: Duration = .seconds(30))
        -> (WorkbenchStore, MemoryCredentials, UserDefaults) {
        let credentials = MemoryCredentials()
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let store = WorkbenchStore(credentials: credentials, defaults: defaults, makeClient: { _ in bridge },
            safetyRefreshInterval: safetyRefreshInterval)
        return (store, credentials, defaults)
    }

    func testSaveOnlyAfterVerifiedStateAndNeverInPreferences() async throws {
        let bridge = FakeBridge(try state())
        let (store, credentials, defaults) = setup(bridge)
        bridge.stateResult = .failure(BridgeError.unauthorized)
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        XCTAssertNil(credentials.token)
        XCTAssertNil(defaults.string(forKey: "bridgeURL"))
        bridge.stateResult = .success(try state())
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        XCTAssertEqual(credentials.token, "secret")
        XCTAssertEqual(defaults.string(forKey: "bridgeURL"), "https://example.test")
        XCTAssertFalse(defaults.dictionaryRepresentation().description.contains("secret"))
        store.background()
        store.disconnect()
        XCTAssertNil(credentials.token)
        XCTAssertNil(defaults.string(forKey: "bridgeURL"))
    }

    func testDraftsPersistAcrossNavigationAndUnknownOutcomeNotRetried() async throws {
        let bridge = FakeBridge(try state())
        let (store, _, _) = setup(bridge)
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        store.background()
        let tab = try XCTUnwrap(store.state?.snapshot.tabs[0])
        let agent = try XCTUnwrap(store.state?.sessions(in: tab)[0])
        store.drafts[agent.id] = " hello "
        bridge.promptResult = .failure(BridgeError.unknownResult)
        await store.send(to: agent)
        XCTAssertEqual(bridge.prompts.count, 1)
        XCTAssertEqual(store.drafts[agent.id], " hello ")
        XCTAssertTrue(store.notice?.contains("unknown") == true)
        XCTAssertTrue(store.uncertainPrompts.contains(agent.id))
        await store.refresh()
        XCTAssertTrue(store.uncertainPrompts.contains(agent.id))
        await store.send(to: agent)
        XCTAssertEqual(bridge.prompts.count, 1) // No silent duplicate after a refresh.
        store.acknowledgeUnknownResult(for: agent.id)
        XCTAssertFalse(store.uncertainPrompts.contains(agent.id))
        store.drafts[agent.id] = String(repeating: "x", count: 20_001)
        await store.send(to: agent)
        XCTAssertEqual(bridge.prompts.count, 1)
        store.drafts[agent.id] = "   "
        await store.send(to: agent)
        XCTAssertEqual(bridge.prompts.count, 1)
        bridge.promptResult = .success(())
        store.drafts[agent.id] = "hello"
        await store.send(to: agent)
        XCTAssertEqual(bridge.prompts.last?.1, "hello")
        XCTAssertEqual(store.drafts[agent.id], "")
        store.disconnect()
    }

    func testViewerCannotSendAndForegroundStartsFreshState() async throws {
        let bridge = FakeBridge(try state(role: "viewer"))
        let (store, _, _) = setup(bridge)
        await store.connect(url: "https://example.test", token: "viewer-secret", allowLocalHTTP: false)
        store.background()
        let agent = try XCTUnwrap(store.state?.sessions(in: store.state!.snapshot.tabs[0])[0])
        store.drafts[agent.id] = "hello"
        await store.send(to: agent)
        XCTAssertTrue(bridge.prompts.isEmpty)
        store.foreground()
        for _ in 0..<20 where bridge.stateCalls < 2 { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertGreaterThanOrEqual(bridge.stateCalls, 2)
        store.background()
    }

    func testEventsCoalesceAndBackgroundStopsStream() async throws {
        let bridge = FakeBridge(try state())
        let (store, _, _) = setup(bridge)
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        for _ in 0..<20 where bridge.continuation == nil { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertNotNil(bridge.continuation)
        let baseline = bridge.stateCalls
        bridge.continuation?.yield(())
        bridge.continuation?.yield(())
        for _ in 0..<20 where bridge.stateCalls == baseline { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertEqual(bridge.stateCalls, baseline + 1)
        for _ in 0..<20 where bridge.stateCalls < baseline + 2 { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertEqual(bridge.stateCalls, baseline + 2) // trailing event is not lost
        store.background()
        let stopped = bridge.stateCalls
        bridge.continuation?.yield(())
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(bridge.stateCalls, stopped)
        store.foreground()
        for _ in 0..<20 where bridge.stateCalls == stopped { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertGreaterThan(bridge.stateCalls, stopped)
        store.background()
    }

    func testViewerCannotSendAfterServerRejectsAndFailedSwitchKeepsExistingConnection() async throws {
        let bridge = FakeBridge(try state())
        let (store, credentials, _) = setup(bridge)
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        store.background()
        bridge.stateResult = .failure(BridgeError.offline)
        await store.connect(url: "https://other.test", token: "new-token", allowLocalHTTP: false)
        XCTAssertEqual(credentials.token, "secret")
        XCTAssertEqual(store.savedURL, "https://example.test")
        store.background()
        let session = try XCTUnwrap(store.state?.sessions(in: store.state!.snapshot.tabs[0])[0])
        store.drafts[session.id] = "hello"
        bridge.promptResult = .failure(BridgeError.forbidden)
        await store.send(to: session)
        XCTAssertEqual(store.drafts[session.id], "hello")
        XCTAssertTrue(store.notice?.contains("Read-only") == true)
        store.disconnect()
    }

    func testCancelledSwitchCannotInstallLateResponseOrDiscardDrafts() async throws {
        let original = FakeBridge(try state())
        let candidate = FakeBridge(try state(role: "viewer"))
        let ready = expectation(description: "Candidate state is pending")
        var continuation: CheckedContinuation<BridgeState, Error>?
        candidate.stateHandler = {
            try await withCheckedThrowingContinuation { suspended in
                continuation = suspended
                ready.fulfill()
            }
        }
        let credentials = MemoryCredentials()
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let store = WorkbenchStore(credentials: credentials, defaults: defaults, makeClient: { connection in
            connection.url.host == "other.test" ? candidate : original
        })
        let initiallyConnected = await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        XCTAssertTrue(initiallyConnected)
        store.background()
        store.drafts["p1"] = "unsent draft"
        let pending = Task { await store.connect(url: "https://other.test", token: "new-token", allowLocalHTTP: false) }
        await fulfillment(of: [ready], timeout: 3)
        pending.cancel()
        store.cancelConnectionAttempt()
        continuation?.resume(returning: try state(role: "viewer")) // A server may complete despite cancellation.
        let installed = await pending.value
        XCTAssertFalse(installed)
        XCTAssertEqual(store.savedURL, "https://example.test")
        XCTAssertEqual(credentials.token, "secret")
        XCTAssertEqual(store.drafts["p1"], "unsent draft")
        store.background()
    }

    func testFailedSwitchKeepsErrorVisibleEvenWhenOldBridgeResumes() async throws {
        let original = FakeBridge(try state())
        let candidate = FakeBridge(try state())
        candidate.stateResult = .failure(BridgeError.unauthorized)
        let credentials = MemoryCredentials()
        let store = WorkbenchStore(credentials: credentials,
            defaults: UserDefaults(suiteName: UUID().uuidString)!, makeClient: { connection in
                connection.url.host == "other.test" ? candidate : original
            })
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        let switched = await store.connect(url: "https://other.test", token: "wrongpass", allowLocalHTTP: false)
        XCTAssertFalse(switched)
        for _ in 0..<20 where original.stateCalls < 2 { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertEqual(store.connectionError, BridgeError.unauthorized.localizedDescription)
        XCTAssertEqual(store.savedURL, "https://example.test")
        XCTAssertEqual(credentials.token, "secret")
        store.background()
    }

    func testSuccessfulRevalidationPreservesDraftsButSwitchClearsThem() async throws {
        let bridge = FakeBridge(try state())
        let (store, _, _) = setup(bridge)
        let first = await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        XCTAssertTrue(first)
        store.background()
        store.drafts["p1"] = "unsent"
        let same = await store.connect(url: "HTTPS://EXAMPLE.TEST:443/", token: "secret", allowLocalHTTP: false)
        XCTAssertTrue(same)
        XCTAssertEqual(store.savedURL, "https://example.test")
        XCTAssertEqual(store.drafts["p1"], "unsent")
        store.background()
        let switched = await store.connect(url: "https://other.test", token: "secret", allowLocalHTTP: false)
        XCTAssertTrue(switched)
        XCTAssertTrue(store.drafts.isEmpty)
        store.background()
    }

    func testActiveTransitionDoesNotCancelPendingConnectionSwitch() async throws {
        let original = FakeBridge(try state())
        let candidate = FakeBridge(try state(role: "viewer"))
        var pending: CheckedContinuation<BridgeState, Error>?
        let ready = expectation(description: "Switch is pending")
        candidate.stateHandler = {
            try await withCheckedThrowingContinuation { continuation in
                pending = continuation
                ready.fulfill()
            }
        }
        let credentials = MemoryCredentials()
        let store = WorkbenchStore(credentials: credentials,
            defaults: UserDefaults(suiteName: UUID().uuidString)!, makeClient: { connection in
                connection.url.host == "other.test" ? candidate : original
            })
        let connected = await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        XCTAssertTrue(connected)
        let switched = Task { await store.connect(url: "https://other.test", token: "new-secret", allowLocalHTTP: false) }
        await fulfillment(of: [ready], timeout: 3)
        store.foreground() // Inactive → active, without an intervening background.
        candidate.stateHandler = nil // Subsequent stream refreshes are no longer suspended.
        pending?.resume(returning: try state(role: "viewer"))
        let installed = await switched.value
        XCTAssertTrue(installed)
        XCTAssertEqual(store.savedURL, "https://other.test")
        XCTAssertEqual(store.role, .viewer)
        store.background()
    }

    func testPromptFinishingInBackgroundDoesNotRestartSynchronization() async throws {
        let bridge = FakeBridge(try state())
        let (store, _, _) = setup(bridge)
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        let session = try XCTUnwrap(store.state?.sessions(in: store.state!.snapshot.tabs[0]).first)
        store.drafts[session.id] = "hello"
        let ready = expectation(description: "Prompt is pending")
        var pending: CheckedContinuation<Void, Error>?
        bridge.promptHandler = {
            try await withCheckedThrowingContinuation { continuation in
                pending = continuation
                ready.fulfill()
            }
        }
        let send = Task { await store.send(to: session) }
        await fulfillment(of: [ready], timeout: 3)
        store.background()
        bridge.stateResult = .failure(BridgeError.offline)
        let calls = bridge.stateCalls
        pending?.resume(returning: ())
        await send.value
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(bridge.stateCalls, calls)
        XCTAssertFalse(store.reconnecting)
        XCTAssertEqual(store.drafts[session.id], "")
    }

    func testExpiredTokenStopsRetryingUntilExplicitRevalidation() async throws {
        let bridge = FakeBridge(try state())
        let (store, _, _) = setup(bridge, safetyRefreshInterval: .milliseconds(100))
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        for _ in 0..<30 where bridge.continuation == nil { try await Task.sleep(for: .milliseconds(20)) }
        XCTAssertNotNil(bridge.continuation)
        bridge.continuation?.finish(throwing: BridgeError.unauthorized)
        for _ in 0..<30 where !store.authenticationFailed { try await Task.sleep(for: .milliseconds(20)) }
        XCTAssertTrue(store.authenticationFailed)
        XCTAssertTrue(store.reconnecting) // Stale controller permissions cannot enable Send.
        let calls = bridge.stateCalls
        try await Task.sleep(for: .milliseconds(220))
        XCTAssertEqual(bridge.stateCalls, calls)
        store.background()
        store.foreground()
        try await Task.sleep(for: .milliseconds(120))
        XCTAssertEqual(bridge.stateCalls, calls)
        let session = try XCTUnwrap(store.state?.sessions(in: store.state!.snapshot.tabs[0]).first)
        store.drafts[session.id] = "should not send"
        await store.send(to: session)
        XCTAssertTrue(bridge.prompts.isEmpty)
        bridge.stateResult = .success(try state(role: "viewer"))
        await store.refresh() // An explicit verification can resume event synchronization.
        XCTAssertFalse(store.authenticationFailed)
        XCTAssertEqual(store.role, .viewer)
        store.background()
    }

    func testUnauthorizedPromptBlocksFurtherSendsAcrossBackground() async throws {
        let bridge = FakeBridge(try state())
        let (store, _, _) = setup(bridge)
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        let session = try XCTUnwrap(store.state?.sessions(in: store.state!.snapshot.tabs[0]).first)
        store.drafts[session.id] = "hello"
        bridge.promptResult = .failure(BridgeError.unauthorized)
        await store.send(to: session)
        XCTAssertTrue(store.authenticationFailed)
        XCTAssertEqual(store.notice, BridgeError.unauthorized.localizedDescription)
        store.background()
        store.foreground()
        await store.send(to: session)
        XCTAssertEqual(bridge.prompts.count, 1)
        XCTAssertEqual(store.drafts[session.id], "hello")
        store.background()
    }

    func testPromptBodyLimitAndWhitespaceSuccess() async throws {
        let bridge = FakeBridge(try state())
        let (store, _, _) = setup(bridge)
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        store.background()
        let agent = try XCTUnwrap(store.state?.sessions(in: store.state!.snapshot.tabs[0]).first)
        store.drafts[agent.id] = String(repeating: "🔥", count: 5_000)
        XCTAssertNotNil(WorkbenchStore.promptValidationError(store.drafts[agent.id]!))
        await store.send(to: agent)
        XCTAssertTrue(bridge.prompts.isEmpty)
        store.drafts[agent.id] = " hello "
        await store.send(to: agent)
        XCTAssertEqual(bridge.prompts.last?.1, "hello")
        XCTAssertEqual(store.drafts[agent.id], "")
        XCTAssertEqual(store.notice, "Prompt accepted.")
        XCTAssertTrue(store.noticeIsSuccess)
        store.background()
    }

    func testManualRefreshEndsReconnectingAndFailedKeychainDeletionStillDisconnects() async throws {
        let bridge = FakeBridge(try state())
        let (store, credentials, defaults) = setup(bridge)
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        for _ in 0..<30 where bridge.continuation == nil { try await Task.sleep(for: .milliseconds(50)) }
        bridge.continuation?.finish(throwing: BridgeError.offline)
        for _ in 0..<30 where !store.reconnecting { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertTrue(store.reconnecting)
        await store.refresh()
        XCTAssertFalse(store.reconnecting)
        XCTAssertNil(store.notice)
        credentials.clearError = BridgeError.offline
        store.disconnect()
        XCTAssertFalse(store.connected)
        XCTAssertNil(store.state)
        XCTAssertTrue(store.drafts.isEmpty)
        XCTAssertNil(defaults.string(forKey: "bridgeURL"))
        XCTAssertEqual(credentials.token, "secret") // Warn; do not claim the token was deleted.
        XCTAssertTrue(store.notice?.contains("may remain in Keychain") == true)
    }

    func testHealthySilentEventStreamRefreshesAndStopsInBackground() async throws {
        let bridge = FakeBridge(try state())
        let (store, _, _) = setup(bridge, safetyRefreshInterval: .milliseconds(100))
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        for _ in 0..<30 where bridge.continuation == nil { try await Task.sleep(for: .milliseconds(20)) }
        XCTAssertNotNil(bridge.continuation)
        bridge.stateResult = .success(try state(role: "viewer")) // No event is emitted.
        for _ in 0..<30 where store.role != .viewer { try await Task.sleep(for: .milliseconds(20)) }
        XCTAssertEqual(store.role, .viewer)
        store.background()
        let calls = bridge.stateCalls
        try await Task.sleep(for: .milliseconds(220))
        XCTAssertEqual(bridge.stateCalls, calls)
    }

    func testLatestStateRequestWinsOverOlderConcurrentSnapshot() async throws {
        let bridge = FakeBridge(try state())
        let (store, _, _) = setup(bridge)
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        store.background()
        var pending: [CheckedContinuation<BridgeState, Error>] = []
        bridge.stateHandler = {
            try await withCheckedThrowingContinuation { pending.append($0) }
        }
        store.foreground() // Older sync request starts first.
        for _ in 0..<30 where pending.count < 1 { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertEqual(pending.count, 1)
        let manual = Task { await store.refresh() }
        for _ in 0..<30 where pending.count < 2 { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertEqual(pending.count, 2)
        pending[1].resume(returning: try state(role: "viewer"))
        await manual.value
        XCTAssertEqual(store.role, .viewer)
        pending[0].resume(returning: try state(role: "controller"))
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(store.role, .viewer) // Older state must not overwrite newer access or output.
        store.background()
    }

    func testOfflineRestoreReusesSavedKeychainToken() async throws {
        let bridge = FakeBridge(try state())
        let (store, credentials, defaults) = setup(bridge)
        await store.connect(url: "https://example.test", token: "secret", allowLocalHTTP: false)
        store.background()
        let reopened = WorkbenchStore(credentials: credentials, defaults: defaults, makeClient: { _ in bridge })
        bridge.stateResult = .failure(BridgeError.offline)
        let failed = await reopened.restore()
        XCTAssertFalse(failed)
        XCTAssertTrue(reopened.canRetrySavedConnection)
        bridge.stateResult = .success(try state())
        let restored = await reopened.restore()
        XCTAssertTrue(restored)
        XCTAssertEqual(reopened.role, .controller)
        XCTAssertEqual(credentials.token, "secret")
        reopened.background()
    }

    func testBackoffBounded() { XCTAssertEqual((1...8).map { WorkbenchStore.backoff(attempt: $0) }, [1, 2, 4, 8, 16, 30, 30, 30]) }
}
