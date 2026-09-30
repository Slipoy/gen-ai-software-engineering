import Foundation
import Testing
@testable import SupportDesk

struct TicketFormValidationTests {
    @Test func anEmptyFormReportsEveryRequiredField() {
        let errors = TicketFormValues().validate()
        #expect(errors[.customerName] == "Name is required")
        #expect(errors[.customerEmail] == "Email is required")
        #expect(errors[.customerId] == "Customer ID is required")
        #expect(errors[.subject] == "Subject is required")
        #expect(errors[.description] == "Description is required")
        // Optional fields stay quiet when empty.
        #expect(errors[.assignedTo] == nil)
        #expect(errors[.tags] == nil)
    }

    @Test func aValidFormHasNoErrors() {
        #expect(Fixtures.validForm().validate().isEmpty)
    }

    @Test func lengthsAreCountedWithoutSurroundingSpaces() {
        var values = Fixtures.validForm()
        values.description = "   too short   "
        #expect(values.validate()[.description] == "Description must be at least 10 characters (now 9)")

        values.subject = String(repeating: "a", count: 201)
        #expect(values.validate()[.subject] == "Subject must be at most 200 characters (now 201)")
    }

    @Test(arguments: ["jane", "jane@", "jane@example", "jane @example.com", "jane@example.c"])
    func rejectsMalformedEmails(_ email: String) {
        var values = Fixtures.validForm()
        values.customerEmail = email
        #expect(values.validate()[.customerEmail] == "Enter an email like name@example.com")
    }

    @Test func limitsTheNumberAndLengthOfTags() {
        var values = Fixtures.validForm()
        values.tags = (1...21).map { "tag\($0)" }.joined(separator: ",")
        #expect(values.validate()[.tags] == "At most 20 tags")

        values.tags = String(repeating: "x", count: 51)
        #expect(values.validate()[.tags] == "Each tag must be at most 50 characters")
    }

    @Test func normalisesTagsLikeTheBackend() {
        #expect(TicketFormValues.parseTags("Login, VIP,, login , ") == ["login", "vip"])
        #expect(TicketFormValues.parseTags("") == [])
    }

    @Test func mapsServerFieldNamesToFormFields() {
        #expect(TicketFormValues.field(forServerField: "customer_email") == .customerEmail)
        #expect(TicketFormValues.field(forServerField: "metadata.browser") == .browser)
        #expect(TicketFormValues.field(forServerField: "tags[2]") == .tags)
        #expect(TicketFormValues.field(forServerField: "id") == nil)
    }

    @Test func startsFromTheTicketWhenEditing() {
        let values = TicketFormValues(ticket: Fixtures.ticket())
        #expect(values.customerName == "Yuki Fischer")
        #expect(values.priority == .urgent)
        #expect(values.tags == "login, password")
        #expect(values.browser == "Chrome 128")
    }
}

struct TicketFormBodyTests {
    @Test func createLeavesOutAutoCategoryAndPriority() throws {
        let body = try #require(try Fixtures.decoded(Fixtures.validForm().createBody()) as? [String: Any])
        #expect(body["category"] == nil)
        #expect(body["priority"] == nil)
        #expect(body["customer_email"] as? String == "jane@example.com")
        #expect(body["status"] as? String == "new")
        // Empty optional text becomes an explicit null.
        #expect(body["assigned_to"] is NSNull)
        let metadata = try #require(body["metadata"] as? [String: Any])
        #expect(metadata["source"] as? String == "web_form")
        #expect(metadata["device_type"] is NSNull)
    }

    @Test func createSendsAChosenCategoryAndTrimmedText() throws {
        var values = Fixtures.validForm()
        values.category = .billingQuestion
        values.subject = "  Refund please  "
        values.tags = "VIP, refund"
        let body = try #require(try Fixtures.decoded(values.createBody()) as? [String: Any])
        #expect(body["category"] as? String == "billing_question")
        #expect(body["subject"] as? String == "Refund please")
        #expect(body["tags"] as? [String] == ["vip", "refund"])
    }

    @Test func anUntouchedEditSendsNothing() {
        let ticket = Fixtures.ticket()
        #expect(TicketFormValues(ticket: ticket).updateBody(comparedTo: ticket).isEmpty)
    }

    @Test func anEditSendsOnlyWhatChanged() {
        // Unchanged category/priority must not be sent: the server treats them as a manual override.
        let ticket = Fixtures.ticket()
        var values = TicketFormValues(ticket: ticket)
        values.priority = .low
        values.status = .resolved
        #expect(values.updateBody(comparedTo: ticket) == [
            "priority": .string("low"),
            "status": .string("resolved"),
        ])
    }

    @Test func clearingTheAssigneeSendsNull() {
        let ticket = Fixtures.ticket()
        var values = TicketFormValues(ticket: ticket)
        values.assignedTo = "  "
        #expect(values.updateBody(comparedTo: ticket) == ["assigned_to": .null])
    }

    @Test func emailCaseAloneIsNotAChange() {
        let ticket = Fixtures.ticket()
        var values = TicketFormValues(ticket: ticket)
        values.customerEmail = "Yuki.Fischer@Northwind.example"
        #expect(values.updateBody(comparedTo: ticket).isEmpty)
    }

    @Test func changedMetadataIsSentAsAPartialObject() {
        let ticket = Fixtures.ticket()
        var values = TicketFormValues(ticket: ticket)
        values.browser = ""
        values.deviceType = .mobile
        #expect(values.updateBody(comparedTo: ticket) == [
            "metadata": .object(["browser": .null, "device_type": .string("mobile")]),
        ])
    }
}
