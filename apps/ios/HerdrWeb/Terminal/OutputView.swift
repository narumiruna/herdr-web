import SwiftUI

struct OutputView: View {
    @EnvironmentObject private var store: WorkbenchStore
    let paneID: String

    var body: some View {
        Group {
            if let output = store.state?.output(for: paneID) {
                ScrollView {
                    Text(output)
                        .font(.custom("JetBrainsMonoNFM-Regular", size: 12))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                }
                .accessibilityIdentifier("outputPreview")
            } else {
                ContentUnavailableView("No recent output", systemImage: "terminal", description:
                    Text(store.state?.readErrors[paneID] ?? "This is a bounded, read-only snapshot; interactive terminal output is not available."))
            }
        }
        .navigationTitle("Recent output")
        .refreshable { await store.refresh() }
    }
}
