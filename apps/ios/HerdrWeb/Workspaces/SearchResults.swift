import Foundation

struct SupervisionSearchResult: Identifiable {
    let id: String
    let spaceID: String
    let tabID: String?
    let sessionID: String?
    let title: String
    let detail: String
}

extension BridgeState {
    func search(_ query: String) -> [SupervisionSearchResult] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return [] }
        var results: [SupervisionSearchResult] = []
        for space in snapshot.workspaces {
            let spaceDirectory = directory(for: space) ?? ""
            if [space.label, spaceDirectory].contains(where: { $0.localizedCaseInsensitiveContains(term) }) {
                results.append(SupervisionSearchResult(id: "space:\(space.id)", spaceID: space.id,
                    tabID: nil, sessionID: nil, title: space.label, detail: spaceDirectory))
            }
            for tab in snapshot.tabs where tab.workspaceID == space.id {
                if tab.label.localizedCaseInsensitiveContains(term) {
                    results.append(SupervisionSearchResult(id: "tab:\(tab.id)", spaceID: space.id,
                        tabID: tab.id, sessionID: nil, title: tab.label, detail: space.label))
                }
                for session in sessions(in: tab) {
                    let type = session.kind == .agent ? "Agent" : "Terminal"
                    let name = session.pane.name
                    let status = session.pane.agentStatus
                    let cwd = directory(for: session.pane) ?? ""
                    if [name, type, status, cwd].contains(where: { $0.localizedCaseInsensitiveContains(term) }) {
                        results.append(SupervisionSearchResult(id: "session:\(session.id)", spaceID: space.id,
                            tabID: tab.id, sessionID: session.id, title: name,
                            detail: "\(space.label) · \(tab.label) · \(type) · \(status)"))
                    }
                }
            }
        }
        return results
    }
}
