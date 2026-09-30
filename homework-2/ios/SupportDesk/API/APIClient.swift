import Foundation

/// Every failed call becomes an APIError, so views handle one shape (the same idea as ApiError in the web app).
struct APIError: Error, LocalizedError, Equatable, Sendable {
    struct FieldError: Decodable, Equatable, Sendable {
        let field: String
        let message: String
    }

    /// HTTP status; 0 when the server could not be reached.
    let status: Int
    let title: String
    let message: String
    let details: [FieldError]

    var errorDescription: String? { message }

    /// The server's message for one form field, e.g. "customer_email" or "metadata.browser".
    func message(for field: String) -> String? {
        details.first { $0.field == field }?.message
    }

    static func network() -> APIError {
        APIError(status: 0, title: "Network error", message: "Cannot reach the server. Is the backend running?", details: [])
    }

    /// Wraps any error thrown by a call, so views only deal with APIError.
    static func from(_ error: Error) -> APIError {
        error as? APIError ?? APIError(status: 0, title: "Unexpected error", message: error.localizedDescription, details: [])
    }
}

/// A JSON value for request bodies that must say "set this field to null" (clearing the assignee),
/// which a plain Codable struct with optionals cannot express: it simply leaves nil fields out.
enum JSONValue: Encodable, Equatable, Sendable {
    case string(String)
    case bool(Bool)
    case array([JSONValue])
    case object([String: JSONValue])
    case null

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    /// `.string(text)`, or `.null` when the text is empty ("no value").
    static func optional(_ text: String?) -> JSONValue {
        guard let text, !text.isEmpty else { return .null }
        return .string(text)
    }
}

extension JSONDecoder {
    /// Decodes the API's JSON: snake_case keys and ISO 8601 dates with milliseconds ("2026-01-01T10:00:00.000Z").
    static let api: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = ISO8601.withFraction.date(from: text) ?? ISO8601.plain.date(from: text) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Not an ISO 8601 date: \(text)"))
        }
        return decoder
    }()
}

/// ISO8601DateFormatter is thread-safe for reading, so sharing instances is fine.
enum ISO8601 {
    nonisolated(unsafe) static let withFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    nonisolated(unsafe) static let plain = ISO8601DateFormatter()
}

/// Filters for GET /tickets. Empty lists mean "any".
struct TicketQuery: Hashable, Sendable {
    var category: [Category] = []
    var priority: [Priority] = []
    var status: [Status] = []
    var search: String = ""

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = []
        if !category.isEmpty { items.append(.init(name: "category", value: category.map(\.rawValue).joined(separator: ","))) }
        if !priority.isEmpty { items.append(.init(name: "priority", value: priority.map(\.rawValue).joined(separator: ","))) }
        if !status.isEmpty { items.append(.init(name: "status", value: status.map(\.rawValue).joined(separator: ","))) }
        let text = search.trimmingCharacters(in: .whitespaces)
        if !text.isEmpty { items.append(.init(name: "search", value: text)) }
        return items
    }
}

/// Thin async/await wrapper over URLSession: one method per backend endpoint, like `ticketsApi` in the web app.
/// A `struct` holding only immutable values, so it is `Sendable` and safe to use from any task.
struct APIClient: Sendable {
    let baseURL: URL
    var session: URLSession = .shared

    /// Reads API_BASE_URL from Info.plist (set in project.yml).
    static let live: APIClient = {
        let text = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? "http://localhost:3000"
        return APIClient(baseURL: URL(string: text)!)
    }()

    struct Health: Decodable, Sendable {
        let status: String
    }

    func health() async throws -> Health {
        try await send(request("health"))
    }

    func tickets(_ query: TicketQuery = TicketQuery()) async throws -> [Ticket] {
        try await send(request("tickets", query: query.queryItems))
    }

    func ticket(id: String) async throws -> Ticket {
        try await send(request("tickets/\(id)"))
    }

    func createTicket(_ body: JSONValue, autoClassify: Bool) async throws -> Ticket {
        try await send(request("tickets", method: "POST", query: flag("auto_classify", autoClassify), json: body))
    }

    func updateTicket(id: String, changes: JSONValue) async throws -> Ticket {
        try await send(request("tickets/\(id)", method: "PUT", json: changes))
    }

    func deleteTicket(id: String) async throws {
        let _: EmptyResponse = try await send(request("tickets/\(id)", method: "DELETE"))
    }

    func autoClassify(id: String, force: Bool = false) async throws -> AutoClassifyOutcome {
        try await send(request("tickets/\(id)/auto-classify", method: "POST", query: flag("force", force)))
    }

    func classificationHistory(id: String) async throws -> [ClassificationDecision] {
        try await send(request("tickets/\(id)/classifications"))
    }

    /// Uploads a CSV/JSON/XML file as multipart/form-data in the field "file", like a browser <input type="file">.
    func importFile(data: Data, filename: String, autoClassify: Bool) async throws -> ImportSummary {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".utf8))
        body.append(Data("Content-Type: application/octet-stream\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))

        var urlRequest = request("tickets/import", method: "POST", query: flag("auto_classify", autoClassify))
        urlRequest.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        urlRequest.httpBody = body
        return try await send(urlRequest)
    }

    // MARK: - Plumbing

    private struct EmptyResponse: Decodable {}

    private func flag(_ name: String, _ on: Bool) -> [URLQueryItem] {
        on ? [URLQueryItem(name: name, value: "true")] : []
    }

    func request(_ path: String, method: String = "GET", query: [URLQueryItem] = [], json: JSONValue? = nil) -> URLRequest {
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }

        var urlRequest = URLRequest(url: components.url!)
        urlRequest.httpMethod = method
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        if let json {
            urlRequest.httpBody = try? JSONEncoder().encode(json)
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return urlRequest
    }

    func send<Response: Decodable>(_ urlRequest: URLRequest) async throws -> Response {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch {
            throw APIError.network()
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw Self.error(status: status, data: data) }
        if status == 204 || data.isEmpty, let empty = EmptyResponse() as? Response { return empty }
        return try JSONDecoder.api.decode(Response.self, from: data)
    }

    /// The backend's error body: {"error": "...", "message": "...", "details": [{field, message}]}.
    static func error(status: Int, data: Data) -> APIError {
        struct Body: Decodable {
            let error: String?
            let message: String?
            let details: [APIError.FieldError]?
        }
        let body = try? JSONDecoder().decode(Body.self, from: data)
        let title = body?.error ?? HTTPURLResponse.localizedString(forStatusCode: status).capitalized
        let details = body?.details ?? []
        let message = body?.message ?? (details.isEmpty ? title : details.map(\.message).joined(separator: "; "))
        return APIError(status: status, title: title, message: message, details: details)
    }
}
