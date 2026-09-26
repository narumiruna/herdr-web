import XCTest
@testable import HerdrWeb

private final class MemoryCredentials: CredentialStoring {
    var token: String?
    func load() -> String? { token }
    func save(_ token: String) throws { self.token = token }
    func clear() throws { token = nil }
}

private final class FakeBridge: BridgeServing {
    var stateResult: Result<BridgeState, Error>
    var promptResult: Result<Void, Error> = .success(())
    var prompts: [(String, String)] = []
    var continuation: AsyncThrowingStream<Void, Error>.Continuation?
    var stateCalls = 0
    init(_ state: BridgeState) { stateResult = .success(state) }
    func state() async throws -> BridgeState {
        stateCalls += 1
        return try stateResult.get()
    }
    func events() async throws -> AsyncThrowingStream<Void, Error> {
        AsyncThrowingStream { self.continuation = $0 }
    }
    func prompt(paneID: String, message: String) async throws {
        prompts.append((paneID, message))
        try promptResult.get()
    }
}

@MainActor
final class StoreTests: XCTestCase {
    private func state(role: String = "controller") throws -> BridgeState {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "state", withExtension: "json"))
        let text = try String(contentsOf: url).replacingOccurrences(of: "\"controller\"", with: "\"\(role)\"")
        return try JSONDecoder().decode(BridgeState.self, from: Data(text.utf8))
    }

    private func setup(_ bridge: FakeBridge) -> (WorkbenchStore, MemoryCredentials, UserDefaults) {
        let credentials = MemoryCredentials()
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let store = WorkbenchStore(credentials: credentials, defaults: defaults, makeClient: { _ in bridge })
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

    func testBackoffBounded() { XCTAssertEqual((1...8).map { WorkbenchStore.backoff(attempt: $0) }, [1, 2, 4, 8, 16, 30, 30, 30]) }
}
