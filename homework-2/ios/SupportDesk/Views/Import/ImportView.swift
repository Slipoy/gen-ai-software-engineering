import SwiftUI
import UniformTypeIdentifiers

/// Bulk import from a CSV, JSON or XML file (ImportPage.tsx on the web). The system file picker
/// (`.fileImporter`) opens Files, iCloud Drive or any file provider; the file is sent as multipart/form-data.
struct ImportView: View {
    @Environment(AppState.self) private var app
    @State private var isPicking = false
    @State private var autoClassify = true
    @State private var isUploading = false
    @State private var fileName: String?
    @State private var summary: ImportSummary?
    @State private var error: String?

    /// Same limit as the backend (multer) and nginx: bigger files are refused before uploading.
    static let maxBytes = 5 * 1024 * 1024
    static let types: [UTType] = [.commaSeparatedText, .json, .xml]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    picker
                    if let error {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline)
                            .foregroundStyle(Theme.danger)
                    }
                    if let summary { SummaryView(summary: summary) }
                }
                .padding(16)
            }
            .background(Theme.background)
            .navigationTitle("Import")
            .fileImporter(isPresented: $isPicking, allowedContentTypes: Self.types) { result in
                switch result {
                case .success(let url): Task { await upload(url) }
                case .failure(let failure): error = failure.localizedDescription
                }
            }
        }
    }

    private var picker: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Add many tickets at once from a CSV, JSON or XML file. Valid records are created; invalid ones are listed with the reason, so you can fix and upload them again.")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
            Toggle("Auto-classify imported tickets", isOn: $autoClassify)
                .font(.subheadline)
            Button {
                isPicking = true
            } label: {
                HStack {
                    if isUploading {
                        ProgressView().tint(Theme.onAccent)
                        Text("Uploading \(fileName ?? "file")…")
                    } else {
                        Image(systemName: "doc.badge.plus")
                        Text("Choose a file")
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(Theme.onAccent)
            .controlSize(.large)
            .disabled(isUploading)
            Text("CSV · JSON · XML, up to 5 MB")
                .font(.mono(.caption))
                .foregroundStyle(Theme.textMuted)
        }
        .padding(14)
        .background(Theme.surface2, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border))
    }

    private func upload(_ url: URL) async {
        error = nil
        summary = nil
        fileName = url.lastPathComponent

        // Files from other apps are outside our sandbox: access must be requested and released explicitly.
        let isScoped = url.startAccessingSecurityScopedResource()
        defer { if isScoped { url.stopAccessingSecurityScopedResource() } }

        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            self.error = "Could not read \(url.lastPathComponent)."
            return
        }
        guard data.count <= Self.maxBytes else {
            error = "\(url.lastPathComponent) is larger than 5 MB."
            return
        }

        isUploading = true
        defer { isUploading = false }
        do {
            let result = try await app.api.importFile(data: data, filename: url.lastPathComponent, autoClassify: autoClassify)
            summary = result
            app.show(Wording.imported(result), isError: result.failed > 0)
            if result.successful > 0 { app.ticketsChanged() }
        } catch {
            let apiError = APIError.from(error)
            self.error = apiError.message
            app.show(apiError.message, isError: true)
        }
    }
}

/// The result of an import: totals and every rejected record with its reasons.
private struct SummaryView: View {
    let summary: ImportSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                stat("Total", summary.total, Theme.text)
                stat("Imported", summary.successful, Theme.success)
                stat("Failed", summary.failed, summary.failed > 0 ? Theme.danger : Theme.textMuted)
            }
            Text("Format: \(summary.format.uppercased())")
                .font(.mono(.caption))
                .foregroundStyle(Theme.textMuted)

            if !summary.failures.isEmpty {
                SectionTitle(text: "Needs fixing")
                ForEach(summary.failures, id: \.self) { failure in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Record \(failure.record)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.text)
                        + Text("  \(failure.location)")
                            .font(.mono(.caption))
                            .foregroundStyle(Theme.textMuted)
                        ForEach(failure.errors, id: \.self) { fieldError in
                            (Text(fieldError.field).font(.mono(.caption)).foregroundStyle(Theme.accentText)
                                + Text("  \(fieldError.message)").font(.caption).foregroundStyle(Theme.textSecondary))
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Theme.surface2, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.danger.opacity(0.35)))
                }
            }
        }
    }

    private func stat(_ label: String, _ value: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(.mono(.title2).weight(.semibold)).foregroundStyle(color)
            Text(label).font(.caption).foregroundStyle(Theme.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.surface2, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border))
    }
}
