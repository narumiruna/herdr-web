import Foundation

struct BridgeState: Decodable {
    let access: Access
    let snapshot: Snapshot
    let reads: [String: PaneRead]
    let previews: [String: PaneRead]
    let readErrors: [String: String]

    struct Access: Decodable {
        let role: Role
    }

    enum Role: String, Decodable {
        case controller, viewer
    }

    enum CodingKeys: String, CodingKey { case access, snapshot, reads, previews, readErrors }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        access = try values.decode(Access.self, forKey: .access)
        snapshot = try values.decode(Snapshot.self, forKey: .snapshot)
        reads = try values.decodeIfPresent([String: PaneRead].self, forKey: .reads) ?? [:]
        previews = try values.decodeIfPresent([String: PaneRead].self, forKey: .previews) ?? [:]
        readErrors = try values.decodeIfPresent([String: String].self, forKey: .readErrors) ?? [:]
    }

    func output(for paneID: String) -> String? {
        // Previews contain the bounded Agent read when terminal streaming is enabled.
        // Snapshot reads contain up to 240 lines when it is disabled.
        guard let text = [previews[paneID]?.text, reads[paneID]?.text].compactMap({ $0 }).first(where: { !$0.isEmpty }) else { return nil }
        return String(text.suffix(65_536).split(separator: "\n", omittingEmptySubsequences: false).suffix(240).joined(separator: "\n"))
    }
}

struct PaneRead: Decodable {
    let text: String
}

struct Snapshot: Decodable {
    let protocolVersion: Int
    let focusedWorkspaceID: String?
    let workspaces: [Space]
    let tabs: [BridgeTab]
    let panes: [BridgePane]
    let agents: [BridgePane]

    enum CodingKeys: String, CodingKey {
        case protocolVersion = "protocol", focusedWorkspaceID = "focused_workspace_id"
        case workspaces, tabs, panes, agents
    }
}

struct Space: Decodable, Identifiable {
    let workspaceID: String
    let label: String
    let activeTabID: String?
    let worktree: Worktree?
    let tokens: [String: String]?

    var id: String { workspaceID }

    enum CodingKeys: String, CodingKey {
        case workspaceID = "workspace_id", label, activeTabID = "active_tab_id", worktree, tokens
    }
}

struct Worktree: Decodable {
    let checkoutPath: String?
    enum CodingKeys: String, CodingKey { case checkoutPath = "checkout_path" }
}

struct BridgeTab: Decodable, Identifiable {
    let tabID: String
    let workspaceID: String
    let label: String
    let number: Int?
    var id: String { tabID }
    enum CodingKeys: String, CodingKey {
        case tabID = "tab_id", workspaceID = "workspace_id", label, number
    }
}

struct BridgePane: Decodable, Identifiable {
    let paneID: String
    let tabID: String
    let workspaceID: String
    let agent: String?
    let displayAgent: String?
    let agentStatus: String
    let cwd: String?
    let foregroundCwd: String?
    let label: String?
    let title: String?
    let stateLabels: [String: String]?
    var id: String { paneID }
    var directory: String? { foregroundCwd ?? cwd }
    var name: String { label ?? title ?? displayAgent ?? agent ?? "Terminal" }

    enum CodingKeys: String, CodingKey {
        case paneID = "pane_id", tabID = "tab_id", workspaceID = "workspace_id"
        case agent, displayAgent = "display_agent", agentStatus = "agent_status"
        case cwd, foregroundCwd = "foreground_cwd", label, title
        case stateLabels = "state_labels"
    }
}

struct Session: Identifiable {
    enum Kind { case agent, terminal }
    let pane: BridgePane
    let kind: Kind
    var id: String { pane.paneID }
}

extension BridgeState {
    func sessions(in tab: BridgeTab) -> [Session] {
        let detected = snapshot.agents.filter { $0.tabID == tab.tabID && $0.workspaceID == tab.workspaceID }
        if !detected.isEmpty {
            return detected.map { agent in
                return Session(pane: agent, kind: .agent)
            }
        }
        guard let pane = snapshot.panes.first(where: { $0.tabID == tab.tabID && $0.workspaceID == tab.workspaceID }) else { return [] }
        return [Session(pane: pane, kind: .terminal)]
    }

    func directory(for space: Space) -> String? {
        space.worktree?.checkoutPath ?? snapshot.panes.first(where: { $0.workspaceID == space.id })?.cwd
    }

    func directory(for pane: BridgePane) -> String? {
        pane.directory ?? snapshot.panes.first(where: { $0.id == pane.id })?.directory
    }
}
