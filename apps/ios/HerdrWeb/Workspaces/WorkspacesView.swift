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
                            Label(notice, systemImage: store.reconnecting ? "wifi.slash" : "exclamationmark.triangle")
                                .foregroundStyle(store.reconnecting ? .orange : .red)
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
            .onChange(of: store.state?.access.role) { _, role in if role != nil { settings = false } }
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

    var body: some View {
        List {
            if let state = store.state {
                let tabs = state.snapshot.tabs.filter { $0.workspaceID == spaceID }
                if tabs.isEmpty { ContentUnavailableView("No tabs", systemImage: "rectangle.on.rectangle") }
                ForEach(tabs) { tab in
                    NavigationLink {
                        SessionsView(tabID: tab.id)
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(tab.label)
                                Text("Tab \(tab.number ?? 0)").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            ForEach(state.sessions(in: tab)) { session in
                                StatusDot(status: session.pane.agentStatus)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(store.state?.snapshot.workspaces.first(where: { $0.id == spaceID })?.label ?? "Workspace")
        .refreshable { await store.refresh() }
    }
}

struct SessionsView: View {
    @EnvironmentObject private var store: WorkbenchStore
    let tabID: String

    var body: some View {
        List {
            if let state = store.state, let tab = state.snapshot.tabs.first(where: { $0.id == tabID }) {
                let sessions = state.sessions(in: tab)
                if sessions.isEmpty { ContentUnavailableView("No panes", systemImage: "terminal") }
                ForEach(sessions) { session in
                    NavigationLink {
                        PaneView(sessionID: session.id, tabID: tabID)
                    } label: {
                        Label {
                            VStack(alignment: .leading) {
                                Text(session.pane.name)
                                Text(session.kind == .agent ? "Agent · \(session.pane.agentStatus)" : "Terminal · Read-only")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        } icon: { StatusDot(status: session.pane.agentStatus) }
                    }
                }
                if !sessions.isEmpty {
                    let extra = state.snapshot.panes.filter { pane in
                        pane.tabID == tabID && !sessions.contains(where: { $0.id == pane.id })
                    }
                    if !extra.isEmpty {
                        Section("Other panes · Read-only") {
                            ForEach(extra) { pane in
                                NavigationLink(pane.name) { OutputView(paneID: pane.id) }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(store.state?.snapshot.tabs.first(where: { $0.id == tabID })?.label ?? "Tab")
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
