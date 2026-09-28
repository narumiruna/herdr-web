import SwiftUI

struct WorkspacesView: View {
    @EnvironmentObject private var store: WorkbenchStore
    @State private var settings = false
    @State private var actions = false

    var body: some View {
        NavigationStack {
            Group {
                if let state = store.state {
                    List {
                        if let notice = store.notice {
                            Label(notice, systemImage: store.reconnecting ? "wifi.slash" : store.noticeIsSuccess ? "checkmark.circle" : "exclamationmark.triangle")
                                .foregroundStyle(store.reconnecting ? .orange : store.noticeIsSuccess ? .green : .red)
                                .accessibilityIdentifier("connectionNotice")
                        }
                        Section("Workspaces") {
                            if state.snapshot.workspaces.isEmpty {
                                ContentUnavailableView("No workspaces", systemImage: "rectangle.stack")
                            }
                            ForEach(state.snapshot.workspaces) { space in
                                NavigationLink {
                                    TabsView(spaceID: space.id)
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(space.label)
                                        if let cwd = state.directory(for: space) {
                                            Text(cwd).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .refreshable { await store.refresh() }
                } else {
                    ContentUnavailableView("Connect to your bridge", systemImage: "network", description: Text(store.notice ?? "Enter your bridge URL and access token."))
                }
            }
            .navigationTitle("herdr-web")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if let role = store.role { Text(role == .viewer ? "Viewer" : "Controller").font(.caption).foregroundStyle(.secondary) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { actions = true } label: { Image(systemName: "ellipsis.circle") }
                        .accessibilityLabel("Actions")
                        .accessibilityIdentifier("actionsMenu")
                }
            }
            .sheet(isPresented: $settings) { ConnectionView(isPresented: $settings).environmentObject(store) }
            .confirmationDialog("Actions", isPresented: $actions) {
                Button("Refresh") { Task { await store.refresh() } }
                Button("Connection") { settings = true }
                if store.connected {
                    Button("Disconnect", role: .destructive) {
                        store.disconnect()
                        if !store.connected { settings = true }
                    }
                    .disabled(store.isSending)
                }
            }
            .task {
                await store.restore()
                if store.connected { settings = false }
            }
            .onAppear { if !store.connected { settings = true } }
        }
    }
}

struct TabsView: View {
    @EnvironmentObject private var store: WorkbenchStore
    let spaceID: String
    @State private var selectedTabID: String?
    @State private var selectedSessionID: String?

    var body: some View {
        VStack(spacing: 0) {
            if let state = store.state {
                let tabs = state.snapshot.tabs.filter { $0.workspaceID == spaceID }
                let preferred = selectedTabID ?? state.snapshot.workspaces.first(where: { $0.id == spaceID })?.activeTabID
                if let tab = tabs.first(where: { $0.id == preferred }) ?? tabs.first {
                    if let sessionID = selectedSessionID, state.sessions(in: tab).contains(where: { $0.id == sessionID }) {
                        PaneView(sessionID: sessionID, tabID: tab.id)
                    } else {
                        SessionsView(tabID: tab.id, selectedSessionID: $selectedSessionID)
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(tabs) { item in
                                Button {
                                    selectedTabID = item.id
                                    selectedSessionID = nil
                                } label: {
                                    HStack(spacing: 5) {
                                        Text(item.label).lineLimit(1)
                                        ForEach(state.sessions(in: item)) { session in
                                            StatusDot(status: session.pane.agentStatus)
                                        }
                                    }
                                    .font(.caption)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 8)
                                    .background(item.id == tab.id ? Color.blue.opacity(0.15) : Color.clear, in: Capsule())
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("tab-\(item.id)")
                            }
                        }
                        .padding(.horizontal)
                    }
                    .padding(.vertical, 5)
                    .background(.bar)
                } else {
                    ContentUnavailableView("No tabs", systemImage: "rectangle.on.rectangle")
                }
            }
        }
        .navigationTitle(store.state?.snapshot.workspaces.first(where: { $0.id == spaceID })?.label ?? "Workspace")
        .toolbar {
            if selectedSessionID != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sessions", systemImage: "list.bullet") { selectedSessionID = nil }
                }
            }
        }
        .onChange(of: spaceID) { _, _ in selectedTabID = nil; selectedSessionID = nil }
    }
}

struct SessionsView: View {
    @EnvironmentObject private var store: WorkbenchStore
    let tabID: String
    @Binding var selectedSessionID: String?

    var body: some View {
        List {
            if let state = store.state, let tab = state.snapshot.tabs.first(where: { $0.id == tabID }) {
                let sessions = state.sessions(in: tab)
                if sessions.isEmpty { ContentUnavailableView("No panes", systemImage: "terminal") }
                ForEach(sessions) { session in
                    Button { selectedSessionID = session.id } label: {
                        Label {
                            VStack(alignment: .leading) {
                                Text(session.pane.name)
                                Text(session.kind == .agent ? "Agent · \(session.pane.agentStatus)" : "Terminal · Read-only")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        } icon: { StatusDot(status: session.pane.agentStatus) }
                    }
                    .foregroundStyle(.primary)
                    .accessibilityIdentifier("session-\(session.id)")
                }
            }
        }
        .refreshable { await store.refresh() }
    }
}

struct StatusDot: View {
    let status: String
    private var color: Color {
        switch status {
        case "blocked": .orange
        case "working": .blue
        case "done": .green
        case "failed": .red
        default: .gray
        }
    }
    var body: some View {
        Circle().fill(color).frame(width: 9, height: 9)
            .accessibilityLabel(status == "blocked" ? "Needs input" : status.capitalized)
    }
}
