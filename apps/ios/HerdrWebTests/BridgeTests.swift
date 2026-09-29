import XCTest
import UIKit
@testable import HerdrWeb

private final class StubProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, Data, String))!
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, data, mime) = try Self.handler(request)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status,
                httpVersion: nil, headerFields: ["Content-Type": mime])!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

final class BridgeTests: XCTestCase {
    private func fixture() throws -> Data {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "state", withExtension: "json"))
        return try Data(contentsOf: url)
    }

    private func client(_ token: String = "secret") throws -> BridgeClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return BridgeClient(connection: try Connection("https://example.test:8443", token: token), configuration: config)
    }

    func testSnapshotMapsOnlyDetectedAgentsAndStandaloneTabs() throws {
        let state = try JSONDecoder().decode(BridgeState.self, from: fixture())
        let t1 = try XCTUnwrap(state.snapshot.tabs.first { $0.id == "t1" })
        let t2 = try XCTUnwrap(state.snapshot.tabs.first { $0.id == "t2" })
        XCTAssertEqual(state.sessions(in: t1).map(\.id), ["p1"])
        XCTAssertEqual(state.sessions(in: t1).first?.kind, .agent)
        XCTAssertEqual(state.sessions(in: t2).map(\.id), ["p3"])
        XCTAssertEqual(state.sessions(in: t2).first?.kind, .terminal)
        XCTAssertEqual(state.output(for: "p1"), "\u{e0b0} agent output")
        XCTAssertEqual(state.output(for: "p3"), "shell output")
        XCTAssertNil(state.output(for: "p4"))
        XCTAssertEqual(state.directory(for: state.snapshot.workspaces[0]), "/work/alpha")
    }

    func testSearchFindsWorkspacesTabsAndDetectedSessions() throws {
        let state = try JSONDecoder().decode(BridgeState.self, from: fixture())
        XCTAssertTrue(state.search(" alpha ").map(\.id).contains("space:w1"))
        XCTAssertEqual(state.search("shell").map(\.id), ["tab:t2"])
        XCTAssertEqual(state.search("Claude").map(\.id), ["session:p1"])
        XCTAssertEqual(state.search("terminal").map(\.id), ["session:p3"])
        XCTAssertTrue(state.search("missing").isEmpty)
    }

    func testDetectedAgentUsesMatchingPaneDetails() throws {
        let raw = try XCTUnwrap(String(data: fixture(), encoding: .utf8))
        let lean = raw.replacingOccurrences(of: "\"agent\": \"claude\",\n        \"display_agent\": \"Claude\",",
            with: "\"terminal_title_stripped\": \"  Agent session  \",")
        XCTAssertNotEqual(lean, raw)
        let state = try JSONDecoder().decode(BridgeState.self, from: Data(lean.utf8))
        let tab = try XCTUnwrap(state.snapshot.tabs.first { $0.id == "t1" })
        let agent = try XCTUnwrap(state.sessions(in: tab).first)
        XCTAssertEqual(agent.kind, .agent)
        XCTAssertEqual(agent.pane.agent, "claude") // Composer eligibility is retained.
        XCTAssertEqual(agent.pane.name, "Agent session")
        XCTAssertEqual(state.directory(for: agent.pane), "/work/alpha")
        XCTAssertEqual(state.search("Agent session").map(\.id), ["session:p1"])
    }

    func testTerminalTitleDecodingAndSearch() throws {
        let raw = try XCTUnwrap(String(data: fixture(), encoding: .utf8))
        let titled = raw.replacingOccurrences(of: "\"pane_id\": \"p3\",",
            with: "\"pane_id\": \"p3\", \"terminal_title_stripped\": \"  zsh workspace  \",")
        let state = try JSONDecoder().decode(BridgeState.self, from: Data(titled.utf8))
        let tab = try XCTUnwrap(state.snapshot.tabs.first { $0.id == "t2" })
        XCTAssertEqual(state.sessions(in: tab).first?.pane.name, "zsh workspace")
        XCTAssertEqual(state.search("zsh workspace").map(\.id), ["session:p3"])
    }

    func testBundledNerdFontLoadsOnSimulator() {
        XCTAssertNotNil(UIFont(name: "JetBrainsMonoNFM-Regular", size: 12))
    }

    func testInvalidStateAndViewerDecoding() throws {
        let data = try fixture()
        let viewer = try XCTUnwrap(String(data: data, encoding: .utf8)).replacingOccurrences(of: "\"controller\"", with: "\"viewer\"")
        XCTAssertEqual(try JSONDecoder().decode(BridgeState.self, from: Data(viewer.utf8)).access.role, .viewer)
        XCTAssertThrowsError(try JSONDecoder().decode(BridgeState.self, from: Data("{}".utf8)))
    }

    func testConnectionRejectsTokenExposureAndUnsafeHTTP() throws {
        for url in ["http://192.168.0.1:8787", "http://example.com", "https://user:pass@example.com",
                    "https://example.com/path", "https://example.com/?token=secret", "https://example.com/#fragment"] {
            XCTAssertThrowsError(try Connection(url, token: "secret", allowLocalHTTP: true), url)
        }
        XCTAssertThrowsError(try Connection("https://example.com", token: "bad\nheader"))
        XCTAssertNoThrow(try Connection("http://bridge.local:8787", token: "secret", allowLocalHTTP: true))
        XCTAssertNoThrow(try Connection("http://[::1]:8787", token: "secret", allowLocalHTTP: true))
        XCTAssertThrowsError(try Connection("http://[::1]:8787", token: "secret"))
        XCTAssertThrowsError(try Connection("http://[::2]:8787", token: "secret", allowLocalHTTP: true))
        XCTAssertThrowsError(try Connection("http://bridge.local:8787", token: "secret"))
        let canonical = try Connection("https://example.com", token: "secret")
        XCTAssertEqual(canonical, try Connection("HTTPS://EXAMPLE.COM:443/", token: "secret"))
        XCTAssertEqual(canonical, try Connection("https://EXAMPLE.com:443/", token: "secret"))
    }

    func testStateAuthenticationAndInvalidJSON() async throws {
        let body = try fixture()
        StubProtocol.handler = { request in
            XCTAssertEqual(request.url?.absoluteString, "https://example.test:8443/api/herdr/state")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer secret")
            XCTAssertNil(request.url?.query)
            return (200, body, "application/json")
        }
        let received = try await client().state()
        XCTAssertEqual(received.snapshot.workspaces.count, 2)
        StubProtocol.handler = { _ in (200, Data("oops".utf8), "application/json") }
        do { _ = try await client().state(); XCTFail("Expected invalid JSON") }
        catch { XCTAssertEqual(error as? BridgeError, .invalidResponse) }
        StubProtocol.handler = { _ in (401, Data("{\"error\":{\"code\":\"unauthorized\"}}".utf8), "application/json") }
        do { _ = try await client().state(); XCTFail("Expected 401") }
        catch { XCTAssertEqual(error as? BridgeError, .unauthorized) }
        StubProtocol.handler = { _ in throw URLError(.timedOut) }
        do { _ = try await client().state(); XCTFail("Expected timeout") }
        catch { XCTAssertEqual(error as? BridgeError, .timeout) }
        StubProtocol.handler = { _ in throw URLError(.cannotConnectToHost) }
        do { _ = try await client().state(); XCTFail("Expected offline") }
        catch { XCTAssertEqual(error as? BridgeError, .offline) }
    }

    func testPromptEncodingPermissionsAndUnknownOutcome() async throws {
        StubProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/api/herdr/agents/w1:p1/prompt")
            XCTAssertTrue(request.url!.absoluteString.contains("w1%3Ap1"))
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer secret")
            let body: Data
            if let stream = request.httpBodyStream {
                stream.open()
                defer { stream.close() }
                var bytes = [UInt8](repeating: 0, count: 4096)
                let count = stream.read(&bytes, maxLength: bytes.count)
                body = Data(bytes.prefix(max(0, count)))
            } else { body = request.httpBody ?? Data() }
            XCTAssertEqual(try JSONDecoder().decode([String: String].self, from: body)["message"], "hello")
            return (200, Data("{}".utf8), "application/json")
        }
        try await client().prompt(paneID: "w1:p1", message: "hello")
        StubProtocol.handler = { _ in (403, Data(), "application/json") }
        do { try await client().prompt(paneID: "p1", message: "hello"); XCTFail("Expected 403") }
        catch { XCTAssertEqual(error as? BridgeError, .forbidden) }
        StubProtocol.handler = { _ in (400, Data(), "application/json") }
        do { try await client().prompt(paneID: "p1", message: "hello"); XCTFail("Expected 400") }
        catch { XCTAssertEqual(error as? BridgeError, .rejected(400)) }
        for status in [200, 503] {
            StubProtocol.handler = { _ in (status, Data("not JSON".utf8), "text/plain") }
            do { try await client().prompt(paneID: "p1", message: "hello"); XCTFail("Expected unknown result") }
            catch { XCTAssertEqual(error as? BridgeError, .unknownResult) }
        }
        StubProtocol.handler = { _ in throw URLError(.timedOut) }
        do { try await client().prompt(paneID: "p1", message: "hello"); XCTFail("Expected unknown result") }
        catch { XCTAssertEqual(error as? BridgeError, .unknownResult) }
    }

    func testEventStreamAndInvalidEvents() async throws {
        StubProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer secret")
            return (200, Data("\n{\"event\":\"pane.updated\"}\n\n{\"event\":\"pane.updated\"}\n".utf8), "application/x-ndjson")
        }
        var count = 0
        do {
            let stream = try await client().events()
            for try await _ in stream { count += 1 }
        } catch { XCTAssertEqual(error as? BridgeError, .offline) }
        XCTAssertTrue((1...2).contains(count)) // Refresh signals may coalesce.
        StubProtocol.handler = { _ in
            (200, Data("{\"event\":\"pane.updated\"}\n".utf8), "Application/X-NDJSON; Charset=UTF-8")
        }
        let mixedCase = try await client().events()
        count = 0
        do { for try await _ in mixedCase { count += 1 } }
        catch { XCTAssertEqual(error as? BridgeError, .offline) }
        XCTAssertEqual(count, 1)
        StubProtocol.handler = { _ in
            (200, Data(String(repeating: "{\"event\":\"pane.updated\"}\n", count: 500).utf8), "application/x-ndjson")
        }
        let burst = try await client().events()
        try await Task.sleep(for: .milliseconds(100)) // Allow the producer to outpace the consumer.
        count = 0
        do { for try await _ in burst { count += 1 } }
        catch { XCTAssertEqual(error as? BridgeError, .offline) }
        XCTAssertTrue((1...2).contains(count), "Only the newest refresh signal should be buffered")
    }
}
