import Foundation

struct Connection: Equatable {
    let url: URL
    let token: String

    init(_ input: String, token: String, allowLocalHTTP: Bool = false) throws {
        guard let components = URLComponents(string: input.trimmingCharacters(in: .whitespacesAndNewlines)),
              let url = components.url, let scheme = components.scheme?.lowercased(),
              let host = components.host?.lowercased(), !host.isEmpty,
              (scheme == "https" || (allowLocalHTTP && scheme == "http" &&
                (host == "localhost" || host == "127.0.0.1" || host == "::1" || host.hasSuffix(".local")))),
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              components.path.isEmpty || components.path == "/",
              components.port.map({ (1...65535).contains($0) }) ?? true,
              !token.isEmpty, token == token.trimmingCharacters(in: .whitespacesAndNewlines),
              !token.contains(where: { $0.isNewline || $0.isWhitespace }) else {
            throw BridgeError.invalidConnection
        }
        self.url = url
        self.token = token
    }
}

enum BridgeError: LocalizedError, Equatable {
    case invalidConnection, unauthorized, forbidden, timeout, offline, invalidResponse, rejected(Int), unknownResult

    var errorDescription: String? {
        switch self {
        case .invalidConnection: "Enter an HTTPS bridge URL and a token. HTTP requires explicit local development mode."
        case .unauthorized: "Invalid or expired token. Check the connection settings."
        case .forbidden: "Read-only access. This token cannot send prompts."
        case .timeout: "The bridge timed out."
        case .offline: "Cannot reach the bridge. Check the network and address."
        case .invalidResponse: "The bridge returned an invalid response."
        case .rejected(let status): "The bridge rejected the request (HTTP \(status))."
        case .unknownResult: "The result is unknown. Check the Agent before choosing whether to send again."
        }
    }
}

protocol BridgeServing {
    func state() async throws -> BridgeState
    func events() async throws -> AsyncThrowingStream<Void, Error>
    func prompt(paneID: String, message: String) async throws
}

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil) // Never forward a bearer token to a redirect target.
    }
}

final class BridgeClient: BridgeServing {
    private let connection: Connection
    private let session: URLSession
    private let delegate = NoRedirects()

    init(connection: Connection, configuration: URLSessionConfiguration = .ephemeral) {
        self.connection = connection
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
    }

    deinit { session.invalidateAndCancel() }

    private func request(_ path: String, method: String = "GET", body: Data? = nil) -> URLRequest {
        // Connection validates the base URL has no path, credentials, query or fragment.
        var components = URLComponents(url: connection.url, resolvingAgainstBaseURL: false)!
        components.percentEncodedPath = path
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("Bearer \(connection.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    private func checked(_ response: URLResponse) throws {
        guard let response = response as? HTTPURLResponse else { throw BridgeError.invalidResponse }
        switch response.statusCode {
        case 200: break
        case 401: throw BridgeError.unauthorized
        case 403: throw BridgeError.forbidden
        default: throw BridgeError.rejected(response.statusCode)
        }
    }

    private func mapped(_ error: Error) -> Error {
        if let error = error as? BridgeError { return error }
        if let error = error as? URLError {
            if error.code == .timedOut { return BridgeError.timeout }
            if error.code == .cancelled { return error }
            return BridgeError.offline
        }
        return error
    }

    func state() async throws -> BridgeState {
        do {
            let (data, response) = try await session.data(for: request("/api/herdr/state"))
            try checked(response)
            do { return try JSONDecoder().decode(BridgeState.self, from: data) }
            catch { throw BridgeError.invalidResponse }
        } catch { throw mapped(error) }
    }

    func prompt(paneID: String, message: String) async throws {
        // Unknown outcomes (transport errors, 5xx, or invalid success bodies) are not retries.
        let escaped = paneID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/%?#:"))) ?? ""
        guard !escaped.isEmpty else { throw BridgeError.invalidConnection }
        let body = try JSONEncoder().encode(["message": message])
        do {
            let (data, response) = try await session.data(for: request("/api/herdr/agents/\(escaped)/prompt", method: "POST", body: body))
            try checked(response)
            guard (try? JSONSerialization.jsonObject(with: data)) != nil else { throw BridgeError.unknownResult }
        } catch {
            let error = mapped(error)
            if error as? BridgeError == .unauthorized || error as? BridgeError == .forbidden { throw error }
            if case BridgeError.rejected(let status) = error, (400...499).contains(status) { throw error }
            throw BridgeError.unknownResult
        }
    }

    func events() async throws -> AsyncThrowingStream<Void, Error> {
        var eventRequest = request("/api/herdr/events")
        eventRequest.timeoutInterval = 45 // server keepalive every 15 seconds
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let (bytes, response) = try await session.bytes(for: eventRequest)
                    try checked(response)
                    guard (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type")?.contains("application/x-ndjson") == true else {
                        throw BridgeError.invalidResponse
                    }
                    var line = Data()
                    for try await byte in bytes {
                        try Task.checkCancellation()
                        if byte == 10 {
                            if !line.isEmpty {
                                guard (try? JSONSerialization.jsonObject(with: line)) != nil else { throw BridgeError.invalidResponse }
                                continuation.yield(())
                            }
                            line.removeAll(keepingCapacity: true)
                        } else {
                            line.append(byte)
                            if line.count > 1_048_576 { throw BridgeError.invalidResponse }
                        }
                    }
                    if !Task.isCancelled { continuation.finish(throwing: BridgeError.offline) }
                } catch {
                    if !Task.isCancelled { continuation.finish(throwing: mapped(error)) }
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
