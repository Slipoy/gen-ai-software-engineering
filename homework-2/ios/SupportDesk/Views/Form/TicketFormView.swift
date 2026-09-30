import SwiftUI

/// Create or edit a ticket in a sheet (NewTicketDialog.tsx + EditTicket.tsx on the web).
/// Errors appear after the first "Save" and then update live while typing; the server's field errors
/// are shown under the same fields and disappear once that field is edited.
struct TicketFormView: View {
    enum Mode {
        case create
        case edit(Ticket)
    }

    let mode: Mode

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var values: TicketFormValues
    @State private var autoClassify = true
    @State private var hasTriedToSave = false
    @State private var serverErrors: [TicketFormValues.Field: String] = [:]
    /// A server error that belongs to no field (e.g. "Ticket not found"), shown at the top.
    @State private var formError: String?
    @State private var isSaving = false
    @FocusState private var focused: TicketFormValues.Field?

    init(mode: Mode) {
        self.mode = mode
        switch mode {
        case .create: _values = State(initialValue: TicketFormValues())
        case .edit(let ticket): _values = State(initialValue: TicketFormValues(ticket: ticket))
        }
    }

    private var isCreate: Bool {
        if case .create = mode { true } else { false }
    }

    private var errors: [TicketFormValues.Field: String] {
        // Local rules first; a server message wins for the same field because it is the final word.
        (hasTriedToSave ? values.validate() : [:]).merging(serverErrors) { _, server in server }
    }

    var body: some View {
        NavigationStack {
            Form {
                if let formError {
                    Section {
                        Label(formError, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(Theme.danger)
                    }
                }

                Section("Customer") {
                    field(.customerName, "Name") { TextField("Jane Doe", text: $values.customerName).textContentType(.name) }
                    field(.customerEmail, "Email") {
                        // `verbatim`: a plain string title is read as Markdown, which turns an email into a link.
                        TextField("Email", text: $values.customerEmail, prompt: Text(verbatim: "jane@example.com"))
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    field(.customerId, "Customer ID") {
                        TextField("CUST-001", text: $values.customerId)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                    }
                }

                Section("Request") {
                    field(.subject, "Subject") { TextField("Cannot log in", text: $values.subject) }
                    field(.description, "Description", hint: "\(values.description.trimmingCharacters(in: .whitespacesAndNewlines).count) / 2000") {
                        TextField("What happened, at least 10 characters", text: $values.description, axis: .vertical)
                            .lineLimit(4...10)
                    }
                }

                Section {
                    Picker("Category", selection: $values.category) {
                        if isCreate { Text("Auto").tag(Category?.none) }
                        ForEach(Category.allCases) { Text($0.label).tag(Category?.some($0)) }
                    }
                    Picker("Priority", selection: $values.priority) {
                        if isCreate { Text("Auto").tag(Priority?.none) }
                        ForEach(Priority.allCases) { Text($0.label).tag(Priority?.some($0)) }
                    }
                    Picker("Status", selection: $values.status) {
                        ForEach(Status.allCases) { Text($0.label).tag($0) }
                    }
                    if isCreate {
                        Toggle("Auto-classify after creating", isOn: $autoClassify)
                    }
                } header: {
                    Text("Triage")
                } footer: {
                    Text(isCreate
                        ? "Leave category and priority on Auto to let the classifier pick them."
                        : "A category or priority you change here is kept, even when the ticket is re-classified.")
                }

                Section("Assignment") {
                    field(.assignedTo, "Assignee") {
                        TextField("agent-anna", text: $values.assignedTo)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    field(.tags, "Tags", hint: "comma-separated") {
                        TextField("login, vip", text: $values.tags)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                }

                Section("Metadata") {
                    Picker("Source", selection: $values.source) {
                        ForEach(Source.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    field(.browser, "Browser") { TextField("Safari 17", text: $values.browser) }
                    Picker("Device", selection: $values.deviceType) {
                        Text("Not set").tag(DeviceType?.none)
                        ForEach(DeviceType.allCases, id: \.self) { Text($0.rawValue.capitalized).tag(DeviceType?.some($0)) }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle(isCreate ? "New ticket" : "Edit ticket")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button(isCreate ? "Create" : "Save") { Task { await save() } }.fontWeight(.semibold)
                    }
                }
            }
            .onChange(of: values) { old, new in
                // Editing a field clears the server's complaint about it (the agent is fixing it).
                for field in TicketFormValues.Field.allCases where old.text(for: field) != new.text(for: field) {
                    serverErrors[field] = nil
                }
            }
            .interactiveDismissDisabled(isSaving)
        }
    }

    /// A labelled input with its error (or hint) underneath.
    private func field(
        _ field: TicketFormValues.Field,
        _ label: String,
        hint: String? = nil,
        @ViewBuilder input: () -> some View
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.caption.weight(.medium)).foregroundStyle(Theme.textMuted)
                Spacer()
                if let hint { Text(hint).font(.mono(.caption2)).foregroundStyle(Theme.textMuted) }
            }
            input()
                .focused($focused, equals: field)
            if let message = errors[field] {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(Theme.danger)
                    .accessibilityLabel("Error: \(message)")
            }
        }
        .padding(.vertical, 2)
    }

    private func save() async {
        hasTriedToSave = true
        formError = nil
        let problems = values.validate()
        guard problems.isEmpty else {
            // Jump to the first broken field, in the order they appear on screen.
            focused = TicketFormValues.Field.allCases.first { problems[$0] != nil }
            return
        }

        isSaving = true
        defer { isSaving = false }
        do {
            switch mode {
            case .create:
                let ticket = try await app.api.createTicket(values.createBody(), autoClassify: autoClassify)
                app.show(Wording.created(ticket))
            case .edit(let ticket):
                let changes = values.updateBody(comparedTo: ticket)
                if changes.isEmpty {
                    app.show("No changes to save.")
                    dismiss()
                    return
                }
                _ = try await app.api.updateTicket(id: ticket.id, changes: .object(changes))
                app.show(Wording.saved(changes))
            }
            app.ticketsChanged()
            dismiss()
        } catch {
            let apiError = APIError.from(error)
            var byField: [TicketFormValues.Field: String] = [:]
            var unmatched: [String] = []
            for detail in apiError.details {
                if let field = TicketFormValues.field(forServerField: detail.field) {
                    byField[field] = byField[field] ?? detail.message
                } else {
                    unmatched.append(detail.message)
                }
            }
            serverErrors = byField
            if byField.isEmpty || !unmatched.isEmpty {
                formError = unmatched.isEmpty ? apiError.message : unmatched.joined(separator: "; ")
            }
            focused = TicketFormValues.Field.allCases.first { byField[$0] != nil }
        }
    }
}
