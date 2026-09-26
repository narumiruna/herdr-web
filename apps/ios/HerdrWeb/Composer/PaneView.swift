import SwiftUI

struct PaneView: View {
    @EnvironmentObject private var store: WorkbenchStore
    let sessionID: String
    let tabID: String

    var body: some View {
        Group {
            if let state = store.state,
               let tab = state.snapshot.tabs.first(where: { $0.id == tabID }),
               let session = state.sessions(in: tab).first(where: { $0.id == sessionID }) {
                VStack(spacing: 0) {
                    HStack {
                        StatusDot(status: session.pane.agentStatus)
                        Text(session.pane.agentStatus == "blocked" ? "Needs input" : session.pane.agentStatus.capitalized)
                        Spacer()
                        Text(session.kind == .agent ? "Agent" : "Terminal")
                    }
                    .font(.subheadline).padding()
                    if let cwd = state.directory(for: session.pane) { Text(cwd).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                    if let notice = store.notice { Text(notice).font(.caption).foregroundStyle(.red).padding(6) }
                    OutputView(paneID: sessionID)
                    if session.kind == .agent && state.access.role == .controller && session.pane.agent != nil {
                        if session.pane.agentStatus == "blocked" && state.snapshot.protocolVersion >= 20 {
                            Text("This Agent cannot accept a prompt in its current state.").font(.footnote).padding()
                        } else {
                            HStack(alignment: .bottom) {
                                TextField("Message Agent", text: Binding(
                                    get: { store.drafts[sessionID] ?? "" },
                                    set: { store.drafts[sessionID] = $0 }
                                ), axis: .vertical)
                                    .lineLimit(1...5)
                                    .accessibilityIdentifier("agentDraft")
                                Button("Send") { Task { await store.send(to: session) } }
                                    .disabled(store.reconnecting || store.sending.contains(sessionID) ||
                                              (store.drafts[sessionID] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                                              (store.drafts[sessionID] ?? "").count > 20_000)
                                    .accessibilityIdentifier("sendPrompt")
                            }
                            .padding()
                        }
                    }
                }
                .navigationTitle(session.pane.name)
            } else {
                ContentUnavailableView("Pane unavailable", systemImage: "questionmark.square")
            }
        }
    }
}
