import Foundation
import Testing
@testable import SupportDesk

/// Stands in for the network: URLSession hands every request to this class instead of sending it,
/// and the test decides the response (msw / a fake backend plays this role in the web tests).
final class MockURLProtocol: URLProtocol, @unchecked Sendable {
    struct Reply: Sendable {
        var status = 200
        var body = Data()
        var fails = false
    }

    /// Set by each test. The suite runs serialized, so tests never overwrite each other's handler.
    nonisolated(unsafe) static var reply = Reply()
    nonisolated(unsafe) static var captured: [URLRequest] = []
    nonisolated(unsafe) static var capturedBodies: [Data] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.captured.append(request)
        Self.capturedBodies.append(Self.body(of: request))
        let reply = Self.reply
        if reply.fails {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
            return
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: reply.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    /// URLSession moves `httpBody` into a stream before a URLProtocol sees it, so read it back from there.
    private static func body(of request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

@Suite(.serialized)
struct APIClientTests {
    let api: APIClient

    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        api = APIClient(baseURL: URL(string: "http://test.local")!, session: URLSession(configuration: configuration))
        MockURLProtocol.reply = MockURLProtocol.Reply()
        MockURLProtocol.captured = []
        MockURLProtocol.capturedBodies = []
    }

    /// Runs a call that should fail and returns its APIError (nil when it unexpectedly succeeds).
    private func apiError(_ call: () async throws -> some Any) async -> APIError? {
        do {
            _ = try await call()
            return nil
        } catch {
            return error as? APIError
        }
    }

    @Test func buildsTheListQueryAsCommaSeparatedFilters() throws {
        let request = api.request("tickets", query: TicketQuery(
            category: [.bugReport, .other], priority: [.urgent], status: Status.open, search: "  login  "
        ).queryItems)
        let url = try #require(request.url)
        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        #expect(components.path == "/tickets")
        #expect(components.queryItems == [
            URLQueryItem(name: "category", value: "bug_report,other"),
            URLQueryItem(name: "priority", value: "urgent"),
            URLQueryItem(name: "status", value: "new,in_progress,waiting_customer"),
            URLQueryItem(name: "search", value: "login"),
        ])
    }

    @Test func anEmptyQueryAsksForEverything() {
        #expect(TicketQuery().queryItems.isEmpty)
        #expect(TicketQuery(search: "   ").queryItems.isEmpty)
    }

    @Test func createsWithAJSONBodyAndTheAutoClassifyFlag() async throws {
        MockURLProtocol.reply.status = 201
        MockURLProtocol.reply.body = try JSONEncoder.snakeCase.encode(Fixtures.ticket())

        let ticket = try await api.createTicket(.object(["subject": .string("Hi")]), autoClassify: true)

        #expect(ticket.id == Fixtures.ticket().id)
        let request = try #require(MockURLProtocol.captured.first)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "http://test.local/tickets?auto_classify=true")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        #expect(MockURLProtocol.capturedBodies.first == Data(#"{"subject":"Hi"}"#.utf8))
    }

    @Test func turnsAValidationErrorIntoFieldMessages() async throws {
        MockURLProtocol.reply.status = 400
        MockURLProtocol.reply.body = Data("""
        {"error":"Validation failed","message":"Request body is invalid",
         "details":[{"field":"customer_email","message":"customer_email must be a valid email address"}]}
        """.utf8)

        let error = try #require(await apiError { try await api.updateTicket(id: "t1", changes: .object([:])) })
        #expect(error.status == 400)
        #expect(error.title == "Validation failed")
        #expect(error.message(for: "customer_email") == "customer_email must be a valid email address")
        #expect(MockURLProtocol.captured.first?.httpMethod == "PUT")
    }

    @Test func explainsANotFoundWithoutABody() async throws {
        MockURLProtocol.reply.status = 404
        let error = try #require(await apiError { try await api.ticket(id: "missing") })
        #expect(error.status == 404)
        #expect(error.message == "Not Found")
    }

    @Test func reportsAnUnreachableServerAsStatusZero() async throws {
        MockURLProtocol.reply.fails = true
        let error = try #require(await apiError { try await api.health() })
        #expect(error == APIError.network())
    }

    @Test func deleteAcceptsAnEmptyResponse() async throws {
        MockURLProtocol.reply.status = 204
        try await api.deleteTicket(id: "t1")
        #expect(MockURLProtocol.captured.first?.httpMethod == "DELETE")
        #expect(MockURLProtocol.captured.first?.url?.path == "/tickets/t1")
    }

    @Test func forcesAReclassification() async throws {
        let outcome = AutoClassifyOutcome(
            ticketId: "t1", category: .bugReport, priority: .high, confidence: 0.8,
            reasoning: "r", keywordsFound: ["crash"], applied: true, ticket: Fixtures.ticket()
        )
        MockURLProtocol.reply.body = try JSONEncoder.snakeCase.encode(outcome)

        let result = try await api.autoClassify(id: "t1", force: true)

        #expect(result.applied)
        #expect(result.keywordsFound == ["crash"])
        #expect(MockURLProtocol.captured.first?.url?.absoluteString == "http://test.local/tickets/t1/auto-classify?force=true")
    }

    @Test func uploadsAnImportAsMultipartFormData() async throws {
        MockURLProtocol.reply.body = Data("""
        {"format":"csv","total":2,"successful":1,"failed":1,"created_ids":["a"],
         "failures":[{"record":2,"location":"line 3","errors":[{"field":"subject","message":"subject is required"}]}]}
        """.utf8)

        let summary = try await api.importFile(data: Data("a,b\n1,2\n".utf8), filename: "tickets.csv", autoClassify: false)

        #expect(summary.failures.first?.errors.first?.field == "subject")
        let request = try #require(MockURLProtocol.captured.first)
        #expect(request.url?.absoluteString == "http://test.local/tickets/import")
        let contentType = try #require(request.value(forHTTPHeaderField: "Content-Type"))
        #expect(contentType.hasPrefix("multipart/form-data; boundary="))
        let body = String(decoding: try #require(MockURLProtocol.capturedBodies.first), as: UTF8.self)
        #expect(body.contains(#"Content-Disposition: form-data; name="file"; filename="tickets.csv""#))
        #expect(body.contains("a,b\n1,2\n"))
    }
}

extension JSONEncoder {
    /// Encodes models the way the backend sends them, so the mock can reply with realistic JSON.
    static var snakeCase: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(ISO8601.withFraction.string(from: date))
        }
        return encoder
    }
}
