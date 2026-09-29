import SwiftUI

@main
struct HerdrWebApp: App {
    @StateObject private var store = WorkbenchStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            WorkspacesView()
                .environmentObject(store)
                .onChange(of: scenePhase) { _, phase in
                    if phase == .background { store.background() }
                    if phase == .active { store.foreground() }
                }
        }
    }
}
